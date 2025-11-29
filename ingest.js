const Parser = require('rss-parser');
const parser = new Parser();

const NEWS_FEEDS = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
];

const ingestNews = async () => {
    let articles = [];
    console.log('Starting news ingestion...');

    for (const feedUrl of NEWS_FEEDS) {
        try {
            const feed = await parser.parseURL(feedUrl);
            console.log(`Fetched ${feed.items.length} articles from ${feedUrl}`);

            const feedArticles = feed.items.map(item => ({
                title: item.title,
                content: item.contentSnippet || item.content || '',
                link: item.link,
                pubDate: item.pubDate,
                source: feed.title
            }));

            articles = [...articles, ...feedArticles];
        } catch (error) {
            console.error(`Error fetching feed ${feedUrl}:`, error.message);
        }
    }

    // Limit to ~50 articles as per requirement
    return articles.slice(0, 50);
};

module.exports = { ingestNews };
