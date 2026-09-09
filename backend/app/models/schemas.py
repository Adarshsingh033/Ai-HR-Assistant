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


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str


class RegisterAdminRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def phone_digits_only(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and str(v).strip():
            val = str(v).strip()
            if not val.isdigit():
                raise ValueError("Phone number must contain only digits (no letters, spaces, or '+' allowed)")
            return val
        return v

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

    @field_validator('phone')
    @classmethod
    def phone_digits_only(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and str(v).strip():
            val = str(v).strip()
            if not val.isdigit():
                raise ValueError("Phone number must contain only digits (no letters, spaces, or '+' allowed)")
            return val
        return v


class HRProfileResponse(BaseModel):
    user_id: str
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    role: str = "hr"
    org_id: Optional[str] = None
    organization_name: Optional[str] = None
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    created_at: Optional[str] = None


class UpdateHRProfileRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def phone_digits_only(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and str(v).strip():
            val = str(v).strip()
            if not val.isdigit():
                raise ValueError("Phone number must contain only digits (no letters, spaces, or '+' allowed)")
            return val
        return v



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

    @field_validator('phone')
    @classmethod
    def phone_digits_only(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and str(v).strip():
            val = str(v).strip()
            if not val.isdigit():
                raise ValueError("Phone number must contain only digits (no letters, spaces, or '+' allowed)")
            return val
        return v


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

    @field_validator('phone')
    @classmethod
    def phone_digits_only(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and str(v).strip():
            val = str(v).strip()
            if not val.isdigit():
                raise ValueError("Phone number must contain only digits (no letters, spaces, or '+' allowed)")
            return val
        return v


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
class InterviewRoundInput(BaseModel):
    round_title: str
    round_description: Optional[str] = ""
    round_order: Optional[int] = None


class CreateJobRequest(BaseModel):
    organization_id: Optional[str] = None
    org_id: Optional[str] = None
    branch_id: Optional[str] = None
    created_by_hr_id: Optional[str] = None
    hr_id: Optional[str] = None

    job_title: str
    department: Optional[str] = None
    employment_type: str = "Full-time"
    work_mode: str = "On-site"
    location: Optional[str] = None
    openings: int = 1
    experience_required: Optional[str] = None
    qualification: Optional[str] = None
    salary: Optional[str] = None
    skills_required: Optional[List[str]] = []
    job_description: str
    status: Optional[str] = "draft"
    field_weights: Optional[dict] = None
    interview_rounds: Optional[List[InterviewRoundInput]] = []


class UpdateJobRequest(BaseModel):
    branch_id: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    openings: Optional[int] = None
    experience_required: Optional[str] = None
    qualification: Optional[str] = None
    salary: Optional[str] = None
    skills_required: Optional[List[str]] = None
    job_description: Optional[str] = None
    status: Optional[str] = None
    field_weights: Optional[dict] = None
    interview_rounds: Optional[List[InterviewRoundInput]] = None


class JobResponse(BaseModel):
    job_id: str
    organization_id: str
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    created_by_hr_id: Optional[str] = None

    job_title: str
    department: Optional[str] = None
    employment_type: str
    work_mode: str
    location: Optional[str] = None
    openings: int = 1
    experience_required: Optional[str] = None
    qualification: Optional[str] = None
    salary: Optional[str] = None
    skills_required: List[str] = []
    job_description: str
    status: str = "draft"
    field_weights: Optional[dict] = None
    total_interview_rounds: int = 0
    interview_rounds: Optional[List[dict]] = []
    closed_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class GenerateJDRequest(BaseModel):
    job_title: str
    department: Optional[str] = None
    employment_type: Optional[str] = "Full-time"
    work_mode: Optional[str] = "On-site"
    location: Optional[str] = None
    experience_required: Optional[str] = None
    qualification: Optional[str] = None
    salary: Optional[str] = None
    skills_required: Optional[List[str]] = []



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


class UpdateCandidateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    total_experience: Optional[str] = None
    skills: Optional[str] = None
    education: Optional[str] = None
    qualification: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
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
    draft_id: Optional[str] = None


class EmailResponse(BaseModel):
    id: str
    hr_id: str
    org_id: str
    candidate_id: Optional[str] = None
    from_email: Optional[str] = None
    to_email: str
    cc_emails: Optional[str] = None
    bcc_emails: Optional[str] = None
    subject: str
    body: str
    folder: str = "sent"
    is_starred: bool = False
    sent_at: Optional[str] = None
    updated_at: Optional[str] = None


class SaveDraftRequest(BaseModel):
    candidate_id: Optional[str] = None
    to_email: Optional[str] = ""
    cc_emails: Optional[str] = ""
    bcc_emails: Optional[str] = ""
    subject: Optional[str] = ""
    body: Optional[str] = ""

class ToggleStarRequest(BaseModel):
    is_starred: bool


# ── Screening Module ─────────────────────────────────────────────────────────
class CreateScreeningRoundRequest(BaseModel):
    job_id: str
    org_id: str
    round_title: str
    round_description: Optional[str] = ""


class UpdateScreeningRoundRequest(BaseModel):
    round_title: Optional[str] = None
    round_description: Optional[str] = None


class UpdateInterviewScheduleRequest(BaseModel):
    interview_schedule: str  # "Pending" or "Active"


class AddScreeningCommentRequest(BaseModel):
    round_id: str
    status: Optional[str] = "Pending"  # "Pending", "In Progress", "Passed", "Failed"
    comment: Optional[str] = ""


class UpdateCandidateInterviewProgressRequest(BaseModel):
    round_id: str
    status: str  # "Ongoing", "Passed", "Rejected", "On Hold"
    score: Optional[int] = None
    comment: Optional[str] = ""


class CompareCandidatesRequest(BaseModel):
    job_id: str
    candidate1_id: str
    candidate2_id: str


# ── Super Admin & Plans ───────────────────────────────────────────────────────
class PlanStatusEnum(str, Enum):
    active = "active"
    inactive = "inactive"

class CreatePlanRequest(BaseModel):
    name: str
    description: Optional[str] = None
    max_organizations: int
    max_branches: int
    max_hr_users: int
    status: Optional[PlanStatusEnum] = PlanStatusEnum.active

class UpdatePlanRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_organizations: Optional[int] = None
    max_branches: Optional[int] = None
    max_hr_users: Optional[int] = None
    status: Optional[PlanStatusEnum] = None

class PlanResponse(BaseModel):
    plan_id: str
    name: str
    description: Optional[str] = None
    max_organizations: int
    max_branches: int
    max_hr_users: int
    status: str
    created_at: str

class CreateAdminRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    plan_id: str

class UpdateAdminPlanRequest(BaseModel):
    plan_id: str

class UpdateAdminStatusRequest(BaseModel):
    status: str # 'active' or 'inactive'

class UpdateAdminRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[EmailStr] = None


class AdminManagementResponse(BaseModel):
    admin_id: str
    username: str
    email: str
    full_name: str
    status: str
    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    created_at: str

class AuditLogResponse(BaseModel):
    log_id: str
    user_id: str
    user_type: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[str] = None
    created_at: str
