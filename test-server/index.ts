import http from "node:http";

export interface TestServerOptions {
  port?: number;
  host?: string;
}

export function createTestServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // Fast 200 OK
    if (pathname === "/" || pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      return;
    }

    // Controllable fixed latency: /delay/:ms or /delay?ms=100
    if (pathname.startsWith("/delay")) {
      const parts = pathname.split("/").filter(Boolean);
      let ms = 100;
      if (parts.length >= 2 && !isNaN(Number(parts[1]))) {
        ms = Number(parts[1]);
      } else if (url.searchParams.has("ms")) {
        ms = Number(url.searchParams.get("ms"));
      }

      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ delayed: ms, timestamp: Date.now() }));
        }
      }, ms);
      return;
    }

    // Controllable error response: /error or /error?status=503
    if (pathname.startsWith("/error")) {
      const statusCode = Number(url.searchParams.get("status") ?? 500);
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Error Simulation", status: statusCode }));
      return;
    }

    // Stall endpoint: keeps socket open without responding (tests coordinated omission & timeouts)
    if (pathname === "/stall") {
      const stallMs = Number(url.searchParams.get("ms") ?? 30000);
      // Wait for stall duration or do nothing until client closes
      const timer = setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ stalled: stallMs }));
        }
      }, stallMs);

      req.on("close", () => {
        clearTimeout(timer);
      });
      return;
    }

    // Fallback 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", path: pathname }));
  });

  return server;
}

export function startTestServer(options: TestServerOptions = {}): Promise<{ server: http.Server; port: number; url: string }> {
  const port = options.port ?? 3000;
  const host = options.host ?? "127.0.0.1";
  const server = createTestServer();

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
      });
    });
    server.on("error", reject);
  });
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("test-server/index.ts") || process.argv[1]?.endsWith("test-server\\index.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  startTestServer({ port }).then(({ url }) => {
    console.log(`[LoadScope Test Server] Running at ${url}`);
    console.log(`Endpoints:`);
    console.log(`  GET /             - 200 OK`);
    console.log(`  GET /delay/:ms    - Controllable latency`);
    console.log(`  GET /error        - 500 Internal Server Error`);
    console.log(`  GET /stall        - Connection stall (no immediate response)`);
  }).catch((err) => {
    console.error("Failed to start test server:", err);
    process.exit(1);
  });
}
