export interface SourceConfig {
  url: string
  name: string
  type: "rss"
}

export const SOURCES: SourceConfig[] = [
  {
    url: "https://simonwillison.net/atom/everything/",
    name: "Simon Willison's Weblog",
    type: "rss",
  },
  {
    url: "https://hnrss.org/frontpage",
    name: "Hacker News",
    type: "rss",
  },
  {
    url: "https://www.technologyreview.com/feed/",
    name: "MIT Technology Review",
    type: "rss",
  },
]
