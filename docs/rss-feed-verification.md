# RSS feed verification

Verified on 2026-09-04 for Morgentidende's planned curated feed pool.

## Rules
- `direct`: may be used as a normal source when the concrete article is suitable.
- `discovery_only`: may be used only to discover outbound links. It must never appear in article sourceRefs, source boxes, evidence counts, or Supabase article-source records.
- Discovery-only pages must be discarded after authoritative/primary outbound links have been extracted.

## Libertarian feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Reason | https://reason.com/feed/ | direct | verified RSS |
| Cato Institute / Cato at Liberty | http://feeds.cato.org/Cato-at-liberty | direct/opinion | verified RSS |
| Foundation for Economic Education | https://fee.org/feed/ | direct/opinion | verified RSS |
| Human Progress | https://humanprogress.org/feed/ | direct | verified RSS |
| Institute of Economic Affairs blog | https://iea.org.uk/blog/feed/ | direct/opinion | verified RSS |

Count with verified RSS: 5/5.

## Islam-critical discovery feeds

| Source | Feed | Mode | Status |
|---|---|---|---|
| Jihad Watch | https://www.jihadwatch.org/feed/ | discovery_only | verified RSS |
| RAIR Foundation USA | https://rairfoundation.com/feed/ | discovery_only | verified RSS |
| Bare Naked Islam | https://barenakedislam.com/feed/ | discovery_only | verified RSS |
| Gates of Vienna | https://gatesofvienna.net/feed | discovery_only | verified RSS |
| FrontPage Magazine | https://frontpagemag.com/feed | discovery_only | verified RSS |

Count with verified RSS: 5/5.

## Removed / not active RSS feeds

- TheReligionOfPeace.com: the site's own FAQ explicitly states that it has no RSS feed. Keep out of the RSS pool.
- Gatestone Institute: useful as a possible web/discovery source, but a current working RSS endpoint was not verified in this pass. Do not include it in the active RSS pool until a current feed is verified.

## Editorial safety

Islam-critical discovery feeds are radar only. Their own prose is not evidence. Scan should extract outbound links and prefer primary sources, authorities, courts, police, local reporting, Reuters/AP/BBC-class media, or other authoritative reporting. The discovery source itself disappears before Desk/Journalist source handling.
