# Audiobookshelf with collection covers (fork for Stereo Panda)

A small, automatically maintained fork of [Audiobookshelf](https://github.com/advplyr/audiobookshelf) that adds two things:

1. **An optional cover image per collection** (upload, URL, or remove) – answering [advplyr/audiobookshelf#2589](https://github.com/advplyr/audiobookshelf/issues/2589). Without a custom cover nothing changes: the collection keeps showing the book cover collage. The 2:1 collection card is unchanged; images that do not fit are contained over a blurred background, like book covers.
2. **A "New Collection" button** on the collections page (and `POST /api/collections` accepts an empty `books` list), so a collection can be created before it has books.

It is meant for people who use the **[Stereo Panda](https://stereopanda.app)** kids' audio-play app, which shows a collection's cover as the picture of a character ("Figur"). Anyone else who wants collection covers is welcome to use it, too.

> This is an unofficial fork. It is not affiliated with or endorsed by the Audiobookshelf project. Audiobookshelf is licensed under GPL-3.0, and so is this fork.

## Use the image

Images are built automatically for every stable upstream release (from 2.37.1 on), for `amd64` and `arm64`:

```
ghcr.io/hthomee/audiobookshelf-collection-cover:2.37.1
ghcr.io/hthomee/audiobookshelf-collection-cover:latest      # newest upstream release
```

Pin a version tag; do not rely on `latest` if you want to control when the server updates. Everything else is exactly as for Audiobookshelf itself (same volumes, ports, environment). With Docker Compose only the `image:` line changes:

```yaml
services:
  audiobookshelf:
    image: ghcr.io/hthomee/audiobookshelf-collection-cover:2.37.1
    ports: ["13378:80"]
    volumes:
      - ./audiobooks:/audiobooks
      - ./config:/config
      - ./metadata:/metadata
    restart: unless-stopped
```

**Make a backup first** (Settings → Backups, plus a copy of `absdatabase.sqlite`). The only database change is one nullable column, `collections.coverPath`. Going back to the original image is possible; see below.

## API

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/collections/:id/cover` | no login needed (like item covers); `width`, `format`, `raw`, `ts` as for item covers |
| `POST` | `/api/collections/:id/cover` | multipart `cover` (png/jpg/webp) or JSON `{"url": "…"}`; needs update + upload permission |
| `DELETE` | `/api/collections/:id/cover` | needs update permission |

The collection JSON gets a `coverPath` field (`string | null`). Covers are stored under `<metadata>/collections/<id>/`, never in your media folders.

## Going back to the original image

Back up, then recreate the container with `ghcr.io/advplyr/audiobookshelf:<version>`. When moving to an **older** version, a down migration removes the `coverPath` column (the image files stay in `metadata/collections/`, the assignment is lost). On the same or a newer version the column is simply ignored.

## How the fork is maintained

- `feature/collection-cover` and `feature/new-collection-button` hold the patches directly on top of upstream `master`, one commit each, with tests.
- A GitHub Actions workflow (`.github/workflows/release.yml`) polls upstream once a day. For every new stable release it applies both patches, renames the migration to the release version, runs lint and unit tests, smoke-tests the image, and pushes it to GHCR.
- If a patch no longer applies, or lint/tests/build fail, no image is pushed and an issue is opened here.
- Details, API contract and manual update steps: [docs/FORK.md](docs/FORK.md) (German).

## Upstream

There is currently no pull request to Audiobookshelf. The upstream project is [reworking the collection API](https://github.com/advplyr/audiobookshelf/issues/5476); once that has settled, the patches may be proposed there. If upstream adds collection covers itself, this fork will be retired.

## Hilfe auf Deutsch

Einrichtung, Rückweg zum Original-Image und Hinweise zur App: [stereopanda.app/hilfe/collection-cover-fork](https://stereopanda.app/hilfe/collection-cover-fork/).
