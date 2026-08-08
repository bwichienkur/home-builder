# API contract

- `GET /api/catalog?q=&category=&cursor=` paginates catalog metadata only.
- `GET /api/projects/:id` returns compact scene JSON.
- `POST /api/projects` creates a project.
- `PUT /api/projects/:id` updates transforms, walls, openings, floors, and material IDs.

The API is stateless. Models remain in versioned CDN object storage and are never embedded in project JSON.
