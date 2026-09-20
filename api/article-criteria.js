export default async function handler(req, res) {
  try {
    const { articleId } = req.query;

    if (!articleId || !/^\d+$/.test(String(articleId))) {
      return res.status(400).json({
        error: 'Valid articleId is required'
      });
    }

    // نفس اسم المفتاح المستخدم في بقية API مشروع وفر
    const apiKey = process.env.AUTOPARTS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'AUTOPARTS_API_KEY is not configured'
      });
    }

    const langId = 4;
    const countryFilterId = 63;

    const url =
      'https://auto-parts-catalog.apiprofile.com' +
      '/api/v2/articles/selection-of-all-specifications-criterias-for-the-article' +
      '/article-id/' + encodeURIComponent(articleId) +
      '/lang-id/' + langId +
      '/country-filter-id/' + countryFilterId;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-apiprofile-key': apiKey
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({
        error: 'Invalid response from parts catalog',
        status: response.status
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Article criteria lookup failed',
        details: data
      });
    }

    return res.status(200).json({
      articleId: Number(articleId),
      criteria: data
    });

  } catch (error) {
    console.error('article-criteria error:', error);

    return res.status(500).json({
      error: 'Article criteria lookup failed',
      message: error.message
    });
  }
}
