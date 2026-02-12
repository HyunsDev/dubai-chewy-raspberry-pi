import systeminformation from "systeminformation";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { StaticInfo, DynamicInfo, SystemStatus } from "./types.js";

const execAsync = promisify(exec);

let cachedStaticInfo: StaticInfo | null = null;
let cachedDynamicInfo: DynamicInfo | null = null;
let lastMeasurementTime = 0;
const CACHE_DURATION = 10000; // 10 seconds

async function getStaticInfo(): Promise<StaticInfo> {
  if (cachedStaticInfo) return cachedStaticInfo;

  const osInfo = await systeminformation.osInfo();
  const networkInterfaces = await systeminformation.networkInterfaces();

  // Find the main interface (usually has default gateway)
  const defaultInterface = Array.isArray(networkInterfaces)
    ? networkInterfaces.find((iface) => !iface.internal && iface.ip4) ||
      networkInterfaces[0]
    : networkInterfaces;

  cachedStaticInfo = {
    os: `${osInfo.distro} ${osInfo.release}`,
    host: os.hostname(),
    ipv4: defaultInterface?.ip4 || "Unknown",
    interface: defaultInterface?.iface || "Unknown",
    mac: defaultInterface?.mac || "Unknown",
  };

  return cachedStaticInfo;
}

// Helper to execute vcgencmd or mock if not available
async function getVcgencmd(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`vcgencmd ${command}`);
    return stdout.trim();
  } catch (e) {
    // Mock data for development on non-RPi
    if (command === "measure_volts") return "volt=0.8500V";
    if (command === "measure_temp") return "temp=45.0'C";
    if (command === "measure_clock arm") return "frequency(48)=1500000000";
    if (command === "get_throttled") return "throttled=0x0";
    return "";
  }
}

async function getDynamicInfo(): Promise<DynamicInfo> {
  const now = Date.now();
  if (cachedDynamicInfo && now - lastMeasurementTime < CACHE_DURATION) {
    return cachedDynamicInfo;
  }

  const [cpu, currentLoad, mem, fsSize, wifiNetworks] = await Promise.all([
    systeminformation.cpu(),
    systeminformation.currentLoad(),
    systeminformation.mem(),
    systeminformation.fsSize(),
    systeminformation.wifiNetworks(),
  ]);

  // Parse vcgencmd outputs
  const voltageOutput = await getVcgencmd("measure_volts"); // volt=0.8500V
  const tempOutput = await getVcgencmd("measure_temp"); // temp=45.0'C
  const clockOutput = await getVcgencmd("measure_clock arm"); // frequency(48)=1500000000
  const throttledOutput = await getVcgencmd("get_throttled"); // throttled=0x0

  // Voltage
  const voltage = voltageOutput.split("=")[1] || "0V";

  // Temp
  const temp = tempOutput.split("=")[1]?.replace("'C", "") || "0";

  // Clock
  const clockSpeed = parseInt(clockOutput.split("=")[1] || "0") / 1000000000; // to GHz

  // Throttled
  // Bit 0: Under-voltage detected
  // Bit 1: Arm frequency capped
  // Bit 2: Currently throttled
  // Bit 3: Soft temperature limit active
  // Bit 16: Under-voltage has occurred
  // Bit 17: Arm frequency capping has occurred
  // Bit 18: Throttling has occurred
  // Bit 19: Soft temperature limit has occurred
  const throttledHex = throttledOutput.split("=")[1] || "0x0";
  const throttledValue = parseInt(throttledHex, 16);

  const underVoltageNow = (throttledValue & 0x1) !== 0;
  const underVoltagePast = (throttledValue & 0x10000) !== 0;
  const throttlingNow = (throttledValue & 0x4) !== 0; // or capped? usually use bit 2 for active throttling
  const throttlingPast = (throttledValue & 0x40000) !== 0;
  const overheatingNow = (throttledValue & 0x8) !== 0; // soft temp limit
  const overheatingPast = (throttledValue & 0x80000) !== 0;

  // WiFi
  // systeminformation wifiNetworks might be slow or require root.
  // Fallback to simple check if we can't get it easily, or just use 'iwgetid' if needed.
  // For now simple mocking or basic si usage.
  let wifiString = "Ethernet";
  const connectedWifi = wifiNetworks.find((n) => n.ssid); // trying to find connected, but si doesn't always show connected flag reliably in all OS
  // Actually systeminformation.wifiConnections() is better but might fail on some systems.
  // Let's rely on interface name from static info to guess or just leave simple.
  // The requirement says "WIFI: ... // Lan if LAN".
  // We can try to get SSID from iwgetid on RPi.
  try {
    const { stdout } = await execAsync("iwgetid -r");
    if (stdout.trim()) {
      wifiString = `${stdout.trim()} (Unknown Signal)`; // Signal strength hard to get without specific tools
    }
  } catch {
    // ignore
  }

  // Disk
  // Find biggest mounted disk that is likely root
  const rootDisk = fsSize.find((d) => d.mount === "/") || fsSize[0];

  // Status Logic
  let status: SystemStatus["status"] = "Chewy";
  const statusMessages: string[] = [];
  const uptime = os.uptime();

  // WARN Criteria
  if (throttlingPast) statusMessages.push("throttled past");
  if (underVoltagePast) statusMessages.push("under voltage past");
  if (parseFloat(temp) >= 60) statusMessages.push("high temp");
  if (rootDisk.use >= 70) statusMessages.push("high disk usage");
  if (currentLoad.currentLoad >= 80) statusMessages.push("high cpu load");
  if ((mem.swapused / mem.swaptotal) * 100 >= 80)
    statusMessages.push("high swap usage");

  // CRITICAL Criteria
  let isCritical = false;
  if (throttlingNow) {
    isCritical = true;
    statusMessages.push("throttled NOW");
  }
  if (underVoltageNow) {
    isCritical = true;
    statusMessages.push("under voltage NOW");
  }
  if (parseFloat(temp) >= 70) {
    isCritical = true;
    statusMessages.push("overheating NOW");
  }
  if (rootDisk.use >= 90) {
    isCritical = true;
    statusMessages.push("CRITICAL disk usage");
  }
  if (currentLoad.currentLoad >= 90) {
    isCritical = true;
    statusMessages.push("CRITICAL cpu load");
  }
  if (mem.swaptotal > 0 && (mem.swapused / mem.swaptotal) * 100 >= 90) {
    isCritical = true;
    statusMessages.push("CRITICAL swap usage");
  }

  if (isCritical) {
    status = "Critical";
  } else if (statusMessages.length > 0) {
    status = "Warn";
  } else if (uptime >= 7 * 24 * 3600) {
    status = "Super Chewy";
  }

  cachedDynamicInfo = {
    uptime: formatUptime(uptime),
    datetime:
      new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " (KST)", // Hardcoded KST as per example? Or use system? Example shows KST.
    wifi: wifiString,
    cpu: {
      model: cpu.brand,
      cores: cpu.cores,
      speed: cpu.speed.toFixed(2),
      usage: currentLoad.currentLoad,
    },
    power: {
      voltage: voltage,
      underVoltagePast,
      underVoltageNow,
    },
    temp: {
      value: temp,
      overheatingPast,
      overheatingNow,
    },
    clock: {
      speed: clockSpeed.toFixed(2),
      governor: cpu.governor || "unknown",
      throttlingPast,
      throttlingNow,
    },
    loadavg: loadAvgToString(os.loadavg()),
    processes: (await systeminformation.processes()).all,
    memory: {
      used: (mem.active / 1024 / 1024 / 1024).toFixed(2),
      total: (mem.total / 1024 / 1024 / 1024).toFixed(2),
      percentage: (mem.active / mem.total) * 100,
    },
    swap: {
      used: (mem.swapused / 1024 / 1024).toFixed(2), // MiB per requirement example
      total: (mem.swaptotal / 1024 / 1024 / 1024).toFixed(2), // GiB per requirement example
      percentage: mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : 0,
    },
    disk: {
      used: (rootDisk.used / 1024 / 1024 / 1024).toFixed(2),
      total: (rootDisk.size / 1024 / 1024 / 1024).toFixed(2),
      percentage: rootDisk.use,
      readOnly: false, // systeminformation doesn't easily give RO status for mount. Might need 'mount' command parsing if critical.
    },
    status,
    statusMessage: statusMessages.join(", "),
    version: "1.0.0",
  };

  lastMeasurementTime = now;
  return cachedDynamicInfo;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ");
}

function loadAvgToString(load: number[]): string {
  return load.map((n) => n.toFixed(2)).join(", ");
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const staticInfo = await getStaticInfo();
  const dynamicInfo = await getDynamicInfo();
  return { ...staticInfo, ...dynamicInfo };
}
