# AO3 work import

A person reading one public work on archiveofourown.org can bring that work
into Breeze's existing reader. The share sheet and the article URL field are
the only entrances. Each explicit action fetches one work. Nothing crawls,
searches, or queues a second work behind the first.

## What is fetched

AO3 already publishes one EPUB per work at
`/downloads/{workId}/work.epub`. That URL answers with a redirect to
`download.archiveofourown.org` for the same path. That host is the file, so
the redirect is followed. No other path on that host is requested. The EPUB is
the book Breeze opens. Chapters stay in the EPUB spine order, and the existing
EPUB reader supplies tap lookup. Title and author come from the EPUB package
document.

The download route does not apply AO3's normal login check. A restricted work
must therefore be recognized before that URL is requested. Breeze first loads
one work or chapter page (`?view_adult=true` on that explicit work only). A
chaptered work answers that URL with a redirect to its first chapter, which is
still one work. A page with a work body may continue to the EPUB. Login-only
means the page itself contains AO3's sentence "This work is only available to
registered users of the Archive" and has no work body. A redirect, a 403, or a
login URL is not that sentence. An adult interstitial with no work body stops
there too. The EPUB is not requested, and no cookie or account is attached.
`view_adult=true` records the person's continue for that one page. It is not a
way around a login wall.

Series, tags, search, and user pages are not one work and are rejected before
any request. A chapter-only URL is resolved from the page that was just loaded,
then one EPUB is fetched. That is at most two requests.

Author notes are included by default. Turning them off removes only AO3's
labeled note blocks in the preface, chapter meta, and end notes. A quotation
in the chapter body stays. If those labels are absent, the text stays too.

## Where it runs

iOS asks AO3 itself, with an ephemeral URLSession, cookies off, and one request
at a time. The client identifies itself as
`Breeze (https://breeze.io.kr; personal reading; one work per explicit request)`.
The share extension only stores the URL in `ShareInbox/Ao3` and asks the app
to open. It does not download. The general pending-link inbox stays dormant.

The in-app URL field uses that same native fetch on iOS. A browser cannot set
this User-Agent and AO3 does not send CORS, so the web field falls through to
`as=ao3` on the existing article function. That mode is in this repo and is
not deployed with this change. A 429 is shown and is not retried until the
person brings the app forward again.

## Terms

AO3's terms prohibit disguising the origin of a request, scraping the archive
to commercialize it, and disrupting the service. This path uses the official
per-work download, names Breeze, fetches only after an explicit action, and
keeps a single work in flight. It does not reuse the article relay's browser
User-Agent. Restricted works are refused in the interface instead of fetched
through the download route.
