"""Bound request bodies before multipart parsing, also without nginx."""
from starlette.responses import JSONResponse


class RequestSizeLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        limit = 26 * 1024 * 1024 if path.endswith("/transcripciones") else 11 * 1024 * 1024 if path.endswith("/adjuntos") else 1024 * 1024
        headers = dict(scope["headers"])
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Content-Length inválido"}, status_code=400)(scope, receive, send)
        if declared > limit or declared < 0:
            return await JSONResponse({"detail": "Petición demasiado grande"}, status_code=413)(scope, receive, send)
        total = 0

        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > limit:
                # HTTPException survives multipart/form parsing's error handler.
                from starlette.exceptions import HTTPException
                raise HTTPException(413, "Petición demasiado grande")
            return message

        await self.app(scope, limited_receive, send)
