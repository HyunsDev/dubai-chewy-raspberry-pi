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

  // 1. 모든 비동기 작업을 병렬로 시작
  // systeminformation과 vcgencmd, 쉘 명령어를 한꺼번에 실행합니다.
  const [
    cpu,
    currentLoad,
    mem,
    fsSize,
    processes,
    voltageOutput,
    tempOutput,
    clockOutput,
    throttledOutput,
    wifiOutput,
  ] = await Promise.all([
    systeminformation.cpu(),
    systeminformation.currentLoad(),
    systeminformation.mem(),
    systeminformation.fsSize(),
    systeminformation.processes(),
    getVcgencmd("measure_volts"),
    getVcgencmd("measure_temp"),
    getVcgencmd("measure_clock arm"),
    getVcgencmd("get_throttled"),
    // wifiNetworks() 대신 iwgetid를 사용해 연결된 SSID만 즉시 가져옵니다.
    execAsync("iwgetid -r").catch(() => ({ stdout: "Ethernet" })),
  ]);

  // 2. 데이터 파싱 로직
  // Voltage: "volt=0.8500V" -> "0.8500V"
  const voltage = voltageOutput.split("=")[1] || "0V";

  // Temp: "temp=45.0'C" -> "45.0"
  const temp = tempOutput.split("=")[1]?.replace("'C", "") || "0";

  // Clock: "frequency(48)=1500000000" -> 1.50 (GHz)
  const clockSpeed = parseInt(clockOutput.split("=")[1] || "0") / 1000000000;

  // Throttled Bitmask 분석
  const throttledHex = throttledOutput.split("=")[1] || "0x0";
  const throttledValue = parseInt(throttledHex, 16);

  const underVoltageNow = (throttledValue & 0x1) !== 0;
  const underVoltagePast = (throttledValue & 0x10000) !== 0;
  const throttlingNow = (throttledValue & 0x4) !== 0;
  const throttlingPast = (throttledValue & 0x40000) !== 0;
  const overheatingNow = (throttledValue & 0x8) !== 0;
  const overheatingPast = (throttledValue & 0x80000) !== 0;

  // WiFi SSID
  const wifiString = (wifiOutput as any).stdout.trim() || "Ethernet";

  // Disk: 루트(/) 마운트 지점 찾기
  const rootDisk = fsSize.find((d) => d.mount === "/") || fsSize[0];

  // 3. 상태(Status) 판단 로직
  let status: SystemStatus["status"] = "Chewy";
  const statusMessages: string[] = [];
  const uptime = os.uptime();

  // WARN 기준
  if (throttlingPast) statusMessages.push("throttled past");
  if (underVoltagePast) statusMessages.push("under voltage past");
  if (parseFloat(temp) >= 60) statusMessages.push("high temp");
  if (rootDisk.use >= 70) statusMessages.push("high disk usage");
  if (currentLoad.currentLoad >= 80) statusMessages.push("high cpu load");
  if (mem.swaptotal > 0 && (mem.swapused / mem.swaptotal) * 100 >= 80)
    statusMessages.push("high swap usage");

  // CRITICAL 기준
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

  // 4. 최종 객체 생성 및 캐싱
  cachedDynamicInfo = {
    uptime: formatUptime(uptime),
    datetime:
      new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " (KST)",
    wifi: wifiString,
    cpu: {
      model: cpu.brand,
      cores: cpu.cores,
      speed: cpu.speed.toFixed(2),
      usage: currentLoad.currentLoad,
    },
    power: {
      voltage,
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
    processes: processes.all,
    memory: {
      used: (mem.active / 1024 / 1024 / 1024).toFixed(2),
      total: (mem.total / 1024 / 1024 / 1024).toFixed(2),
      percentage: (mem.active / mem.total) * 100,
    },
    swap: {
      used: (mem.swapused / 1024 / 1024).toFixed(2),
      total: (mem.swaptotal / 1024 / 1024 / 1024).toFixed(2),
      percentage: mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : 0,
    },
    disk: {
      used: (rootDisk.used / 1024 / 1024 / 1024).toFixed(2),
      total: (rootDisk.size / 1024 / 1024 / 1024).toFixed(2),
      percentage: rootDisk.use,
      readOnly: false,
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
