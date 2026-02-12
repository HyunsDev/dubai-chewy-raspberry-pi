import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { getSystemStatus } from "./measure.js";
import { SystemStatus } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true,
});

// Register static file serving
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/",
});

// Helper to format status text
async function formatStatusText(
  stats: SystemStatus,
  useColors: boolean = false,
): Promise<string> {
  const c = (colorCode: string, text: string) =>
    useColors ? `<span style="color:${colorCode}">${text}</span>` : text;
  const teal = "#00AAAA";
  const white = "#FFFFFF";
  const grey = "#888888";
  const warning = "#FFAA00";
  const critical = "#FF0000";
  const green = "#00FF00";
  const orange = "#E95420";

  const statusColor =
    stats.status === "Critical"
      ? critical
      : stats.status === "Warn"
        ? warning
        : green;

  // Status line builders
  const powerFlags = [];
  if (stats.power.underVoltagePast || stats.power.underVoltageNow) {
    powerFlags.push(
      `⚡ Under Voltage [${stats.power.underVoltagePast ? "Past" : ""}${stats.power.underVoltagePast && stats.power.underVoltageNow ? "/" : ""}${stats.power.underVoltageNow ? "Now" : ""}]`,
    );
  }

  const tempFlags = [];
  if (stats.temp.overheatingPast || stats.temp.overheatingNow) {
    tempFlags.push(
      `🔥 Overheating [${stats.temp.overheatingPast ? "Past" : ""}${stats.temp.overheatingPast && stats.temp.overheatingNow ? "/" : ""}${stats.temp.overheatingNow ? "Now" : ""}]`,
    );
  }

  const throttleFlags = [];
  if (stats.clock.throttlingPast || stats.clock.throttlingNow) {
    throttleFlags.push(
      `🐌 Throttling [${stats.clock.throttlingPast ? "Past" : ""}${stats.clock.throttlingPast && stats.clock.throttlingNow ? "/" : ""}${stats.clock.throttlingNow ? "Now" : ""}]`,
    );
  }

  const C = (k: string, v: string, extra: string = "") =>
    `${c(teal, k)} ${c(white, v)}${extra}`;

  const art = [
    c(orange, `                             ....               `),
    c(orange, `              .',:clooo:  .:looooo:.            `),
    c(orange, `           .;looooooooc  .oooooooooo'           `),
    c(orange, `        .;looooool:,''.  :ooooooooooc           `),
    c(orange, `       ;looool;.         'oooooooooo,           `),
    c(orange, `      ;clool'             .cooooooc.  ,,        `),
    c(orange, `         ...                ......  .:oo,       `),
    c(orange, `  .;clol:,.                        .loooo'      `),
    c(orange, ` :ooooooooo,                        'ooool      `),
    c(orange, `'ooooooooooo.                        loooo.     `),
    c(orange, `'ooooooooool                         coooo.     `),
    c(orange, ` ,loooooooc.                        .loooo.     `),
    c(orange, `   .,;;;'.                          ;ooooc      `),
    c(orange, `       ...                         ,ooool.      `),
    c(orange, `    .cooooc.              ..',,'.  .cooo.       `),
    c(orange, `      ;ooooo:.           ;oooooooc.  :l.        `),
    c(orange, `       .coooooc,..      coooooooooo.            `),
    c(orange, `         .:ooooooolc:. .ooooooooooo'            `),
    c(orange, `           .':loooooo;  ,oooooooooc             `),
    c(orange, `               ..';::c'  .;loooo:'              `),
  ];

  const info = [
    `${c(teal, "ubuntu@ubuntu")}`,
    `${c(grey, "-------------")}`,
    C("OS:", stats.os),
    C("Host:", stats.host),
    C("Uptime:", stats.uptime),
    C("Datetime:", stats.datetime),
    C("IPv4:", `${stats.ipv4} (${stats.interface})`),
    C("WIFI:", stats.wifi),
    C(
      "CPU:",
      `${stats.cpu.model} (${stats.cpu.cores}) @ ${stats.cpu.speed}GHz - (${stats.cpu.usage.toFixed(0)}%)`,
    ),
    C(
      "Power:",
      `${stats.power.voltage}`,
      powerFlags.length ? ` - ${c(warning, powerFlags.join(", "))}` : "",
    ),
    C(
      "Temp:",
      `${stats.temp.value}°C`,
      tempFlags.length ? ` - ${c(warning, tempFlags.join(", "))}` : "",
    ),
    C(
      "Clock:",
      `${stats.clock.speed} GHz (${stats.clock.governor})`,
      throttleFlags.length ? ` - ${c(warning, throttleFlags.join(", "))}` : "",
    ),
    C("Loadavg:", stats.loadavg),
    C("Processes:", stats.processes.toString()),
    C(
      "Memory:",
      `${stats.memory.used} GiB / ${stats.memory.total} GiB (${stats.memory.percentage.toFixed(0)}%)`,
    ),
    C(
      "Swap:",
      `${stats.swap.used} MiB / ${stats.swap.total} GiB (${stats.swap.percentage.toFixed(0)}%)`,
    ),
    C(
      "Disk:",
      `${stats.disk.used} GiB / ${stats.disk.total} GiB (${stats.disk.percentage.toFixed(0)}%)`,
      stats.disk.readOnly ? ` - ${c(critical, "🚫 Read Only")}` : "",
    ),
    `${c(grey, "-------------")}`,
    C("Version:", stats.version),
    C(
      "Status:",
      c(
        statusColor,
        `${stats.status === "Chewy" ? "🍡" : stats.status === "Super Chewy" ? "🍡" : stats.status === "Warn" ? "⚠️" : "🚨"} ${stats.status}${stats.statusMessage ? ` (${stats.statusMessage})` : ""}`,
      ),
    ),
  ];

  const merged = [];
  for (let i = 0; i < Math.max(art.length, info.length); i++) {
    const artLine = art[i] || "".padEnd(40, " ");
    const infoLine = info[i] || "";
    merged.push(`${artLine}${infoLine}`);
  }

  return merged.join("\n");
}

// Endpoints
fastify.get("/health", async () => {
  return { ok: true };
});

fastify.get("/api/json", async () => {
  return await getSystemStatus();
});

fastify.get("/api/text", async () => {
  const stats = await getSystemStatus();
  return await formatStatusText(stats, false);
});

fastify.get<{ Querystring: { icon?: string } }>(
  "/api/html",
  async (request, reply) => {
    const stats = await getSystemStatus();
    const useIcon = request.query.icon !== "false";
    const text = await formatStatusText(stats, true);

    reply.type("text/html");
    return `${text}`;
  },
);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 10002, host: "0.0.0.0" });
    console.log(`Server listening on http://0.0.0.0:10002`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
