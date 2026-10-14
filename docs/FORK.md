# Fork notes

This is a small, automatically maintained fork of [Audiobookshelf](https://github.com/advplyr/audiobookshelf). It adds two independent features:

1. **Optional custom cover for collections** ([advplyr/audiobookshelf#2589](https://github.com/advplyr/audiobookshelf/issues/2589)). Without a custom cover nothing changes: the collection keeps showing the book cover collage. The 2:1 collection card is unchanged; images that do not match are contained over a blurred background, like `BookCover` does.
2. **"New Collection" button** on the collections page. For this `POST /api/collections` accepts a missing or empty `books` list.

Nothing else is changed. Everything else is exactly Audiobookshelf.

## Branches

| Branch | Based on | Content |
| --- | --- | --- |
| `main` | upstream `master` | readme, this file, release automation (`.github/workflows/release.yml`, `.github/scripts/`). Default branch. |
| `feature/collection-cover` | upstream `master` | the cover feature, one commit, with tests |
| `feature/new-collection-button` | upstream `master` | the button, one commit, with tests |
| `release/vX.Y.Z` | upstream tag `vX.Y.Z` | both patches applied, migration renamed to the release version |
| `master` | | untouched copy of upstream master |

## Changed files

Collection cover (server): migration `…-add-collection-cover-path` (nullable `collections.coverPath`, idempotent, with `down`), `models/Collection.js`, `controllers/CollectionController.js` (`uploadCover`, `removeCover`, `getCover`), `managers/CoverManager.js`, `managers/CacheManager.js`, `routers/ApiRouter.js`, `Auth.js` (cover GET without login, like item covers), `controllers/LibraryController.js` (covers are removed with the library).

Collection cover (client): `components/covers/CollectionCover.vue` (shows the own cover, falls back to the collage), `components/modals/collections/EditModal.vue` (cover view: upload, URL, remove), small pass-through changes in `LazyCollectionCard.vue`, `CollectionItem.vue`, `pages/collection/_id.vue`.

Button: `NewCollectionModal.vue`, `BookShelfToolbar.vue`, `client/strings/en-us.json`, `CollectionController.create`.

Covers are stored in `<metadata>/collections/<collectionId>/cover.<jpg|png|webp>`. Nothing is written to media folders.

## API

The collection JSON has a new field:

```json
{ "id": "…", "name": "…", "coverPath": "/metadata/collections/<id>/cover.jpg", "lastUpdate": 1760180000000 }
```

`coverPath` is `string | null`; use it as a flag. `lastUpdate` changes whenever the cover is set or removed and works as a cache buster.

| Method | Path | Auth | Body / query | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/collections/:id/cover` | none (like `/api/items/:id/cover`) | `width` (default 400, max 4096), `height`, `format` = `webp`/`jpeg`/`png`, `raw=1`, `ts=<lastUpdate>` | `200` image, `404` no custom cover, `400` invalid id/parameter |
| `POST` | `/api/collections/:id/cover` | Bearer token; `canUpdate` and `canUpload` | multipart `cover` (png/jpg/jpeg/webp) **or** JSON `{"url":"https://…"}` | `200 {"success":true,"cover":"<path>"}` |
| `DELETE` | `/api/collections/:id/cover` | Bearer token; `canUpdate` | – | `200` (also if there was no cover) |
| `POST` | `/api/collections` | Bearer token; `canUpdate` | `{"libraryId":"…","name":"…","description":null,"books":[]}`; `books` may be omitted | `200` collection JSON |

Example URL for a client: `{server}/api/collections/{id}/cover?width=600&format=jpeg&ts={lastUpdate}`

## Releases and automation

`.github/workflows/release.yml` runs daily (and on demand). For every new stable upstream release from `MIN_VERSION` on it:

1. checks out the tag and cherry-picks the commits of both `feature/*` branches (`.github/scripts/apply-patches.sh`),
2. renames the migration so Audiobookshelf runs it for that release (`.github/scripts/set-migration-version.sh`),
3. runs lint and unit tests, builds the image natively for `amd64` and `arm64`, smoke-tests it (`/healthcheck`),
4. pushes `ghcr.io/<owner>/audiobookshelf-collection-cover:<tag>` (multi-arch), `:<version>` and, for the newest release, `:latest`.

If a patch does not apply, or lint/tests/build fail, nothing is pushed and an issue is opened.

### Manual update

```bash
git fetch origin --tags            # origin = advplyr/audiobookshelf
git checkout feature/collection-cover      && git rebase origin/master
git checkout feature/new-collection-button && git rebase origin/master
cp -r .github/scripts /tmp/scripts          # the tag does not contain the scripts
PATCH_BRANCHES="feature/collection-cover feature/new-collection-button" BASE_REF=origin/master \
  /tmp/scripts/apply-patches.sh v2.38.0    # exit code 2 = cherry-pick conflict, report in /tmp/patch-conflict.md
git switch -c release/v2.38.0
```

Then run lint and tests (`npm ci && npm run lint && npm test`) and build the image.

Things to check for each release:

1. **Migration name.** Audiobookshelf runs a migration only if old DB version < migration version <= `version` in `package.json`. `set-migration-version.sh <x.y.z>` renames file, test, changelog line and version strings accordingly.
2. **Upstream migrations.** A new upstream migration is normal; only one touching `collections.coverPath` would be a problem.
3. **Conflicts** are most likely in `CollectionController.js`, `CacheManager.js`, `CoverManager.js`, `Auth.js` and `EditModal.vue`. Upstream is reworking the collection API, so expect changes there.
4. **Upstream may have the feature by then.** Check issue #2589; in that case drop the patch and use the original image.

## Going back to the original image

Back up first (Settings → Backups, plus a copy of `absdatabase.sqlite`). When moving to an **older** original release, a down migration removes the `coverPath` column (images in `metadata/collections/` stay, the assignment is lost). On the same or a newer release the column stays and is ignored.

## Tests

Unit tests: 15 controller tests and 4 migration tests for the cover, 2 for the empty collection (`test/server/…`). Also run against real containers: a database created with the original release, upgrade, upload/replace/remove covers, delete collection, error cases (not an image: 400, invalid id: 400, no cover: 404).
