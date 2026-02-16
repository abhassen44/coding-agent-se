from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    """Schema for user registration."""
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponse(UserBase):
    """Schema for user response."""
    id: int
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for authentication token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Schema for token refresh request."""
    refresh_token: str


class TokenPayload(BaseModel):
    """Schema for token payload."""
    sub: str
    exp: datetime
    type: str
