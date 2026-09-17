export default async function handler(req, res) {
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AUTOPARTS_API_KEY is not configured"
      });
    }

    const response = await fetch(
      "https://auto-parts-catalog.apiprofile.com/api/v2/manufacturers/list/type-id/1",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-apiprofile-key": apiKey
        }
      }
    );

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch vehicle manufacturers",
      details: error.message
    });
  }
}
