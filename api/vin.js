export default async function handler(req, res) {
  try {
    const apiKey = process.env.AUTOPARTS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "AUTOPARTS_API_KEY is not configured"
      });
    }

    const vin = String(req.query.vin || "")
      .trim()
      .toUpperCase();

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return res.status(400).json({
        error: "A valid 17-character VIN is required"
      });
    }

    const response = await fetch(
      `https://auto-parts-catalog.apiprofile.com/api/v2/vin/tecdoc-vin-check/${encodeURIComponent(vin)}`,
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
    console.error("VIN API error:", error);

    return res.status(500).json({
      error: "Failed to check VIN"
    });
  }
}
