export async function fileBytes({
  url,
  fetchResponse,
}: {
  url: string;
  fetchResponse: (url: string) => Promise<Response>;
}): Promise<Uint8Array> {
  const response = await fetchResponse(url);

  if (response.status !== 200) {
    throw new Error(
      `Box download at ${url} returned status ${response.status}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
