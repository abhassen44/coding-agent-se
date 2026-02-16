from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, CurrentUser
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.schemas.auth import UserCreate, UserLogin, UserResponse, Token, TokenRefresh
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: DbSession):
    """Register a new user."""
    auth_service = AuthService(db)
    
    # Check if user already exists
    existing_user = await auth_service.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Create new user
    user = await auth_service.create_user(user_data)
    return user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: DbSession):
    """Login and get access token."""
    auth_service = AuthService(db)
    
    user = await auth_service.authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(subject=user.id, additional_claims={"role": user.role})
    refresh_token = create_refresh_token(subject=user.id)
    
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh_token(token_data: TokenRefresh, db: DbSession):
    """Get new access token using refresh token."""
    payload = decode_token(token_data.refresh_token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(int(user_id))
    
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    access_token = create_access_token(subject=user.id, additional_claims={"role": user.role})
    new_refresh_token = create_refresh_token(subject=user.id)
    
    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser):
    """Get current user information (requires authentication)."""
    return current_user
