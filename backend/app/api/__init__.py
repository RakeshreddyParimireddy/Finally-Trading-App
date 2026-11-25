"""HTTP API routers (health, watchlist, portfolio) and error handlers."""

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.services.errors import ServiceError

from .health import router as health_router
from .portfolio import router as portfolio_router
from .watchlist import router as watchlist_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(watchlist_router)
api_router.include_router(portfolio_router)


async def _service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


async def _validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Contract: errors are always {"detail": "<string>"} and validation is 400.
    parts = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", ()) if p != "body")
        parts.append(f"{loc}: {err.get('msg')}" if loc else str(err.get("msg")))
    return JSONResponse({"detail": "; ".join(parts) or "Invalid request"}, status_code=400)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ServiceError, _service_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)


__all__ = ["api_router", "register_error_handlers"]
