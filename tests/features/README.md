# Features

Reference features for the test site that `.github/scripts/build-ddev-site.sh`
builds (or the Webship Workspace's builder, with `--install --add-users
--sample-content`): an app made with the official installer from the website
template, the roles the build gives its accounts, the template's own seed (the
home and contact pages, the contact form, 3 posts, 6 categories, 4 images, the
header and footer links, its posts' author) and 12 more posts and 2 drafts, and
the accounts of `cucumber.js` (`administrator`, `editor`, and the template seed's
`demo-author`). Each scenario makes the documents it needs and deletes them after
it, so a feature runs as it is on any such site.

| Feature | Covers |
| --- | --- |
| `session` | A visitor sent to the login page, the first-user screen gone, each account logging in through the form, a refused login, a session taken over, logging out, an account without a role refused. |
| `access` | What the editor and the administrator see in the navigation and the dashboard, the addresses the editor may not open, the accounts each may see and add. |
| `account` | The account page: a role the editor may not change, its name changed, passwords that do not match, a form left without saving. |
| `list` | The count, the rows and the pages, a search, sorting both ways, the filters by status, by a relationship and by a text, the columns, the page size. |
| `edit-view` | A new post with a rich text, an image and a category, published; values taken out; the slug unlocked; a publication refused; a deletion; a copy. |
| `blocks-and-arrays` | Blocks added, moved, collapsed and removed; the rows of an array inside a block; the header's links changed and left without saving. |
| `drafts-and-versions` | A published post changed, compared with its published version and restored; a change reverted; unpublished and published again; posts edited, published, unpublished and deleted together. |
| `live-preview` | The live preview following the form, and the preview link. |
| `media` | An image uploaded with its alternative text and deleted; the media list. |
| `front-end` | The website: its navigation, the posts and their pages, a post, the search, a post published, the contact form refused and sent, a missing page. |

The assertions that must fail are in `tests/must-fail/` (`npm run test:must-fail`).
