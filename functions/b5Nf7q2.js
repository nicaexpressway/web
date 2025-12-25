export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true }));
}
