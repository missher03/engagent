from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    llm_model_fast: str = "claude-haiku-5-5"
    llm_model_smart: str = "claude-sonnet-5-5"

    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"

    google_tts_api_key: str = ""
    google_tts_voice_a: str = "en-US-Neural2-D"
    google_tts_voice_b: str = "en-US-Neural2-F"

    datamuse_api_key: str = ""

    database_url: str = "sqlite:///./engagent.db"
    storage_dir: str = "./storage"
    cors_origins: str = "http://localhost:3000"

    # Đặt FORCE_MOCK=1 để bỏ qua mọi API ngoài (dùng cho test/offline)
    force_mock: bool = False

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key) and not self.force_mock

    @property
    def azure_enabled(self) -> bool:
        return bool(self.azure_speech_key) and not self.force_mock

    @property
    def tts_enabled(self) -> bool:
        return bool(self.google_tts_api_key) and not self.force_mock


@lru_cache
def get_settings() -> Settings:
    return Settings()
