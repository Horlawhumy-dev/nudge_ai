from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# pgvector caps ANN indexes (hnsw, ivfflat) at 2000 dimensions per column.
HNSW_MAX_DIM = 2000


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- app ---
    app_name: str = "NudgeAI"
    environment: str = "dev"
    debug: bool = False
    api_prefix: str = "/api/v1"
    # Comma-separated browser origins allowed by CORS. "*" (the dev default) allows any origin
    # but, per the CORS spec, cannot be combined with credentials. Native apps are unaffected.
    cors_origins: str = "*"

    # --- database (PostgreSQL 16, local, no docker) ---
    # Socket + peer auth (no password):
    #   postgresql+psycopg://haroffcode@/nudgeai?host=/var/run/postgresql
    # TCP with password:
    #   postgresql+psycopg://haroffcode:pw@127.0.0.1:5432/nudgeai
    database_url: str = Field(
        default="postgresql+psycopg://haroffcode@/nudgeai?host=/var/run/postgresql"
    )
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_echo: bool = False

    # --- redis 7 (local, no modules) ---
    redis_url: str = "redis://127.0.0.1:6379/0"
    redis_required: bool = False  # cache/queue degrade gracefully when False

    # --- auth ---
    # Placeholder only; must be overridden in any non-dev environment.
    jwt_secret: str = "dev-only-change-me"  # noqa: S105
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30

    # --- verification / reset codes (design shows a 00:59 resend countdown) ---
    # The mobile design shows four boxes; keep the two in step.
    verification_code_length: int = 4
    verification_code_ttl_minutes: int = 15
    verification_code_max_attempts: int = 5
    resend_cooldown_seconds: int = 60
    password_reset_code_ttl_minutes: int = 15

    # --- abuse limits (per client address, fixed window; see app/api/limits.py) ---
    rate_limits_enabled: bool = True
    rate_limit_signup_per_hour: int = 10
    rate_limit_login_per_5min: int = 10
    rate_limit_code_attempts_per_5min: int = 15
    rate_limit_forgot_per_hour: int = 6
    rate_limit_speech_per_minute: int = 20
    rate_limit_vision_per_minute: int = 6

    # --- Meta endpoints (Meta models only) ---
    # Chat runs on the Meta Model API (smart/deep tiers) and Baseten, which
    # serves the open-weight fast tier. Either side may be left unconfigured:
    # a provider without a key degrades to the scripted fake, loudly logged.
    meta_api_key: str = ""
    meta_api_base_url: str = ""
    baseten_api_key: str = ""
    baseten_base_url: str = ""
    # Meta's model list has no embedding model yet, so this stays empty and
    # get_embedder() falls back to the offline StaticEmbedder (token hash, no
    # semantic recall). Gate 2b open item: set a real id once one exists.
    embedding_model: str = ""
    # Keep this in step with memories.embedding. pgvector refuses to build an
    # HNSW or IVFFlat index above 2000 dimensions
    # ("column cannot have more than 2000 dimensions for hnsw index"), so 1024
    # is the default: indexable, and half the storage per memory.
    embedding_dim: int = 1024
    # Set False to allow the full 2048 dims, which means no ANN index at all.
    hnsw_index_enabled: bool = True

    # --- semantic cache ---
    semantic_cache_threshold: float = 0.08
    semantic_cache_ttl_days: int = 7

    # --- memory retrieval ---
    memory_top_k: int = 5
    memory_min_similarity: float = 0.35

    # --- tools ---
    calendar_enabled: bool = False  # deterministic stub until a real credential exists

    # --- plans ---
    # What Free includes (the numbers shown on the app's subscription screen). Pro is unlimited.
    free_habit_limit: int = 3
    free_tasks_per_day: int = 5
    # There is no billing provider yet. While true, a signed-in user can switch plan themselves
    # through PUT /subscription so the whole app can be exercised. Turn off in production and
    # replace with the store/webhook flow.
    billing_stub_enabled: bool = True

    # --- push (Expo) ---
    push_delivery_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str = ""
    push_timeout_seconds: float = 10.0

    # --- uploads ---
    # Avatars are written here and served read-only at /media. Point it at a persistent volume
    # in production; swap for object storage when the app runs on more than one host.
    media_dir: str = "media"
    avatar_max_bytes: int = 2_000_000

    # --- email ---
    resend_api_key: str = Field(default="", description="Resend API key for email delivery")
    # Must be an address on a domain verified in Resend. The shared onboarding@resend.dev
    # sender can only deliver to the Resend account owner.
    email_from: str = "Nudge <onboarding@resend.dev>"

    # --- phase 2: model router (Meta models only) ---
    # MODEL_FAST is the hackathon id for the open-weight tier served on
    # Baseten. MODEL_SMART / MODEL_DEEP are placeholders until Gate 2b
    # confirms the real Muse Spark ids from the Meta model list. Nothing
    # calls them without a key (the fake serves instead), so a wrong id here
    # fails loudly at probe time, not silently in production.
    model_fast: str = "meta-models/muse-spark-open-1026"
    model_smart: str = "meta-models/muse-spark"
    model_deep: str = "meta-models/muse-spark-deep"
    # Hard cap on prompt assembly. A 1M context window is not a licence to fill it.
    chat_history_messages: int = 20
    # Generous ceiling, few retries: cold starts on hosted tiers are slow, and
    # a 30s timeout failed almost every call when this was first measured.
    model_timeout_seconds: float = 120.0
    model_max_retries: int = 1
    model_retry_backoff_seconds: float = 1.0
    # Ceiling from the plan: routing must never spend a model call to decide.
    planner_context_tokens: int = 200_000

    # --- voice: Meta's Muse Voice Transcribe, the only speech model we use ---
    muse_voice_model: str = ""
    # Meta documents a realtime WebSocket endpoint (wss://api.meta.ai/v1/asr/realtime). This is
    # the HTTP file-upload route used for short voice notes; its path and payload have NOT been
    # confirmed against Meta's docs yet, so it is configurable. Empty derives
    # "<META_API_BASE_URL>/audio/transcriptions". See app/ai/speech.py.
    muse_voice_url: str = ""
    # A photo of a to-do list, whiteboard or schedule (POST /vision/extract).
    vision_max_bytes: int = 5_000_000
    vision_max_items: int = 12
    # A voice note is a chat turn, not a recording session.
    speech_max_bytes: int = 10_000_000
    speech_timeout_seconds: float = 60.0

    # --- phase 2: budgets (per user, per UTC day) ---
    budget_daily_calls: int = 200
    budget_daily_tokens: int = 500_000
    # Reaching the ceiling pins the route to the fast tier rather than erroring.
    budget_degraded_model: str = "fast"

    # --- phase 2: executor ---
    executor_max_hops: int = 4
    max_tool_result_chars: int = 2000

    # --- phase 2: observability ---
    # Force the offline fake model so tests never touch a live endpoint.
    force_fake_models: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("embedding_dim")
    @classmethod
    def _dim_supported(cls, v: int) -> int:
        # 1..2000 keeps the pgvector ANN index; up to 2048 is storable with
        # HNSW_INDEX_ENABLED=false (exact search only).
        if v <= 0 or v > 2048:
            raise ValueError("embedding_dim must be 1..2048 (truncate to <=2000 for ANN)")
        return v

    def model_post_init(self, _context: object) -> None:
        tiers = {
            "model_fast": self.model_fast,
            "model_smart": self.model_smart,
            "model_deep": self.model_deep,
        }
        # The three tiers must not collapse onto one model, or routing is theatre.
        if len(set(tiers.values())) != 3:
            raise ValueError(f"the three router tiers must be distinct models, got {tiers}")
        if self.hnsw_index_enabled and self.embedding_dim > HNSW_MAX_DIM:
            raise ValueError(
                f"embedding_dim={self.embedding_dim} exceeds the pgvector ANN index "
                f"limit of {HNSW_MAX_DIM} dimensions, so the HNSW index cannot be "
                "created. Lower embedding_dim (1024 keeps the index), or set "
                "HNSW_INDEX_ENABLED=false to store wider vectors and rely on "
                "exact search."
            )
        # HS256 needs >= 32 bytes of key material (RFC 7518 3.2). The default
        # placeholder is intentionally short, so only enforce this off-dev.
        if self.environment != "dev" and len(self.jwt_secret.encode()) < 32:
            raise ValueError(
                f"JWT_SECRET is {len(self.jwt_secret)} bytes; HS256 requires at least "
                "32. Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )

    @property
    def sync_database_url(self) -> str:
        """Alembic runs synchronously; psycopg3 handles both drivers."""
        return self.database_url.replace("+psycopg://", "+psycopg://")


@lru_cache
def get_settings() -> Settings:
    return Settings()
