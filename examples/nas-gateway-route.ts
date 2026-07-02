import {
  createNasFileLockProvider,
  createNasGateway
} from "large-image-ingest/node";

const gateway = createNasGateway({
  stagingRoot: "/mnt/inspection-staging",
  targetRoot: "/mnt/inspection-originals",
  defaultExpiresInMs: 24 * 60 * 60 * 1000,
  lockProvider: createNasFileLockProvider({
    lockRoot: "/mnt/inspection-staging/.locks",
    staleLockMs: 2 * 60 * 60 * 1000
  })
});

export async function handleNasUploadRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname;

  if (request.method === "POST" && route === "/api/nas/uploads") {
    const body = await request.json() as {
      expectedChunks: number;
      metadata?: Record<string, unknown>;
      sessionId?: string;
      targetRelativePath: string;
      totalBytes: number;
    };
    const session = await gateway.createSession(body);

    return Response.json(session);
  }

  if (request.method === "PUT" && route.startsWith("/api/nas/uploads/") && route.endsWith("/chunks")) {
    const sessionId = getSessionId(route);
    const index = Number(url.searchParams.get("index"));
    const session = await gateway.stageChunk({
      sessionId,
      index,
      body: await request.arrayBuffer()
    });

    return Response.json(session);
  }

  if (request.method === "POST" && route.startsWith("/api/nas/uploads/") && route.endsWith("/finalize")) {
    const sessionId = getSessionId(route);
    const session = await gateway.finalizeSession({
      sessionId
    });

    return Response.json(session);
  }

  if (request.method === "DELETE" && route.startsWith("/api/nas/uploads/")) {
    const sessionId = getSessionId(route);

    await gateway.cancelSession({
      sessionId
    });

    return new Response(null, {
      status: 204
    });
  }

  return Response.json({
    error: "Not found"
  }, {
    status: 404
  });
}

function getSessionId(route: string): string {
  const sessionId = route.split("/")[4];

  if (!sessionId) {
    throw new Error("Missing NAS upload session id.");
  }

  return sessionId;
}
