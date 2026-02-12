export interface StaticInfo {
  os: string;
  host: string;
  ipv4: string;
  interface: string;
  mac: string;
}

export interface DynamicInfo {
  uptime: string;
  datetime: string;
  wifi: string; // "SSID - Signal" or "LAN - 1000Mbps"
  cpu: {
    model: string;
    cores: number;
    speed: string; // GHz
    usage: number; // %
  };
  power: {
    voltage: string; // V
    underVoltagePast: boolean;
    underVoltageNow: boolean;
  };
  temp: {
    value: string; // °C
    overheatingPast: boolean;
    overheatingNow: boolean;
  };
  clock: {
    speed: string; // GHz
    governor: string; // ondemand etc
    throttlingPast: boolean;
    throttlingNow: boolean;
  };
  loadavg: string;
  processes: number;
  memory: {
    used: string; // GiB
    total: string; // GiB
    percentage: number; // %
  };
  swap: {
    used: string; // MiB
    total: string; // GiB
    percentage: number; // %
  };
  disk: {
    used: string; // GiB
    total: string; // GiB
    percentage: number; // %
    readOnly: boolean;
  };
  status: "Chewy" | "Super Chewy" | "Warn" | "Critical";
  statusMessage?: string;
  version: string;
}

export interface SystemStatus extends StaticInfo, DynamicInfo {}
