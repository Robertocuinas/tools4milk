from fastapi import HTTPException, UploadFile


async def read_upload(file: UploadFile, limit: int) -> bytes:
    if file.size is not None and file.size > limit:
        raise HTTPException(413, "El fichero supera el tamaño permitido")
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, "El fichero supera el tamaño permitido")
    return data
