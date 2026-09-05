# Media vision URL-domain commissioning fix

The live v3 commissioning run exposed Cloudflare Workers AI error 8007 when Gemma vision was given a remote `workers.dev` image URL. Cloudflare's image-text input accepts a data URI, so Media now fetches candidate images inside the Worker, bounds the payload to 6 MB, and sends base64 image data to vision. Generated R2 images are passed to vision directly from their bytes, avoiding a self-referential public URL fetch.
