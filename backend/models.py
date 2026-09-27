from typing import Optional
from sqlmodel import SQLModel, Field


class Participant(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    email: Optional[str] = None
    school: str
    major: str
    year: str
    grad_year: int
    gpa_band: Optional[str] = None
    team_id: Optional[str] = None
    is_synthetic: bool = False
    # JSON-encoded fields
    internships_json: str = Field(default="[]")
    skills_json: str = Field(default="[]")
    dev_groups_json: str = Field(default="[]")
    hackathons_json: str = Field(default="[]")
    involvement_json: str = Field(default="[]")
    answers_json: str = Field(default="{}")
    teammates_json: str = Field(default="[]")
    friends_json: str = Field(default="[]")
    interest_tags_json: str = Field(default="[]")
    latent_archetype: Optional[str] = None  # never returned in public API


class ParticipantPublic(SQLModel):
    id: str
    name: str
    school: str
    major: str
    year: str
    grad_year: int
    gpa_band: Optional[str] = None
    team_id: Optional[str] = None
    is_synthetic: bool = False
    internships: list[dict] = []
    skills: list[str] = []
    dev_groups: list[str] = []
    hackathons: list[str] = []
    involvement: list[str] = []
    answers: dict = {}
    teammates: list[str] = []
    friends: list[str] = []
    interest_tags: list[str] = []


class ParticipantCreate(SQLModel):
    name: str
    email: Optional[str] = None
    school: str
    major: str
    year: str
    grad_year: int
    internships: list[dict] = []
    skills: list[str] = []
    dev_groups: list[str] = []
    hackathons: list[str] = []
    involvement: list[str] = []
    answers: dict = {}
    teammates: list[str] = []
    friends: list[str] = []
    consent: bool  # Must be True
