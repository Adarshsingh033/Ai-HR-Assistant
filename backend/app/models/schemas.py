from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    HR = "hr"


# ── Auth ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterAdminRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Username must be alphanumeric (underscores/hyphens allowed)')
        return v.lower()

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v


class LoginResponse(BaseModel):
    success: bool
    role: Optional[str] = None
    user_id: Optional[str] = None
    username: Optional[str] = None
    org_id: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    message: Optional[str] = None


class AdminProfileResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    role: str = "admin"
    created_at: Optional[str] = None


class UpdateAdminProfileRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None


# ── Organization ─────────────────────────────────────────────────────────────
class IndustryEnum(str, Enum):
    information_technology = "information_technology"
    financial_services = "financial_services"
    healthcare = "healthcare"
    education = "education"
    manufacturing = "manufacturing"


class CompanySizeEnum(str, Enum):
    size_1_10 = "1-10"
    size_11_50 = "11-50"
    size_51_200 = "51-200"
    size_201_500 = "201-500"
    size_501_1000 = "501-1000"
    size_1000_plus = "1000+"


class OrgStatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"


class CreateOrgRequest(BaseModel):
    organization_name: str
    industry: IndustryEnum
    company_size: CompanySizeEnum
    status: Optional[OrgStatusEnum] = OrgStatusEnum.active
    image: Optional[str] = None


class UpdateOrgRequest(BaseModel):
    organization_name: Optional[str] = None
    industry: Optional[IndustryEnum] = None
    company_size: Optional[CompanySizeEnum] = None
    status: Optional[OrgStatusEnum] = None
    image: Optional[str] = None


class OrganizationResponse(BaseModel):
    org_id: str
    organization_name: str
    industry: str
    company_size: str
    status: str = "active"
    image: Optional[str] = None
    created_at: str


# ── Branch Management ────────────────────────────────────────────────────────
class CreateBranchRequest(BaseModel):
    organization_id: str
    branch_name: str
    branch_code: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class UpdateBranchRequest(BaseModel):
    organization_id: Optional[str] = None
    branch_name: Optional[str] = None
    branch_code: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class BranchResponse(BaseModel):
    branch_id: str
    organization_id: str
    organization_name: Optional[str] = None
    branch_name: str
    branch_code: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    created_at: str
    updated_at: str


# ── HR / Organization Members Management ─────────────────────────────────────
class CreateMemberRequest(BaseModel):
    organization_id: str
    branch_id: str
    full_name: str
    username: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    image: Optional[str] = None
    status: Optional[str] = "active"


class UpdateMemberRequest(BaseModel):
    organization_id: Optional[str] = None
    branch_id: Optional[str] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    image: Optional[str] = None
    status: Optional[str] = None


class MemberResponse(BaseModel):
    member_id: str
    organization_id: str
    organization_name: Optional[str] = None
    branch_id: str
    branch_name: Optional[str] = None
    full_name: str
    username: str
    email: str
    phone: Optional[str] = ""
    image: Optional[str] = None
    status: str = "active"
    created_at: str
    updated_at: str


class CreateHRRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str


class AssignHRRequest(BaseModel):
    hr_id: str
    org_id: str


class HRResponse(BaseModel):
    hr_id: str
    username: str
    email: str
    full_name: str
    org_id: Optional[str] = None
    created_at: str


# ── Job Vacancy ───────────────────────────────────────────────────────────────
class CreateJobRequest(BaseModel):
    title: str
    department: str
    location: str
    job_type: str          # Full-time / Part-time / Contract
    experience_required: str
    skills_required: List[str]
    description: str
    org_id: str
    hr_id: str


class JobResponse(BaseModel):
    job_id: str
    title: str
    department: str
    location: str
    job_type: str
    experience_required: str
    skills_required: List[str]
    description: str
    org_id: str
    hr_id: Optional[str] = None
    created_at: str


class GenerateJDRequest(BaseModel):
    title: str
    department: str
    location: str
    job_type: str
    experience_required: str
    skills_required: List[str]


# ── Candidate ─────────────────────────────────────────────────────────────────
class CandidateResponse(BaseModel):
    candidate_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    total_experience: Optional[str] = None
    skills: Optional[List[str]] = None
    job_id: str
    org_id: str
    hr_id: Optional[str] = None
    filename: str
    match_percentage: Optional[int] = None
    match_explanation: Optional[str] = None
    reached: bool = False
    remark: Optional[str] = None
    created_at: str


class UpdateCandidateStatusRequest(BaseModel):
    reached: Optional[bool] = None
    remark: Optional[str] = None


# ── Chatbot ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str
    hr_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    context_used: Optional[List[str]] = None


# ── Emails ────────────────────────────────────────────────────────────────────
class GenerateEmailRequest(BaseModel):
    candidate_id: Optional[str] = None
    prompt: str


class DraftResponse(BaseModel):
    subject: str
    body: str


class SendEmailRequest(BaseModel):
    candidate_id: Optional[str] = None
    to_email: str
    cc_emails: Optional[str] = None
    bcc_emails: Optional[str] = None
    subject: str
    body: str


class SentEmailResponse(BaseModel):
    id: str
    hr_id: str
    org_id: str
    candidate_id: Optional[str] = None
    to_email: str
    cc_emails: Optional[str] = None
    bcc_emails: Optional[str] = None
    subject: str
    body: str
    sent_at: str
