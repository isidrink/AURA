export async function POST(request: Request) {
  const apiKey = process.env.RETELL_API_KEY;
  const agentId = process.env.RETELL_AGENT_ID;

  if (!apiKey || !agentId) {
    return Response.json(
      { error: "Es necesario configurar RETELL_API_KEY y RETELL_AGENT_ID." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const response = await fetch("https://api.retellai.com/v2/create-web-call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      retell_llm_dynamic_variables: {
        language: body.locale || "es",
        selected_context: body.context || "",
        channel: "web_avatar",
      },
    }),
  });

  const payload = await response.json();
  return Response.json(payload, { status: response.status });
}
