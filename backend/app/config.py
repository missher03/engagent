from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Nhà cung cấp LLM: "anthropic" (Claude) hoặc "minimax"
    llm_provider: str = "anthropic"

    anthropic_api_key: str = ""
    llm_model_fast: str = "claude-haiku-5-5"
    llm_model_smart: str = "claude-sonnet-5-5"

    # MiniMax qua giao diện tương thích Anthropic. China: https://api.minimax.cn/anthropic
    # Global: https://api.minimax.io/anthropic
    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimax.cn/anthropic"
    minimax_model_fast: str = "MiniMax-M3.1-Flash"
    minimax_model_smart: str = "MiniMax-M3.1-Flash"

    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"

    google_tts_api_key: str = ""
    google_tts_voice_a: str = "en-US-Neural2-D"
    google_tts_voice_b: str = "en-US-Neural2-F"

    datamuse_api_key: str = ""

    database_url: str = "sqlite:///./engagent.db"
    storage_dir: str = "./storage"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Mã mời: nếu đặt, muốn tạo tài khoản phải nhập đúng mã này (nên đặt khi đưa app lên Internet
    # để người lạ không tạo tài khoản và dùng key LLM của bạn). Để trống = ai cũng tạo được.
    signup_code: str = ""

    # Đặt FORCE_MOCK=1 để bỏ qua mọi API ngoài (dùng cho test/offline)
    force_mock: bool = False

    @property
    def is_minimax(self) -> bool:
        return self.llm_provider.strip().lower() == "minimax"

    @property
    def llm_enabled(self) -> bool:
        key = self.minimax_api_key if self.is_minimax else self.anthropic_api_key
        return bool(key) and not self.force_mock

    @property
    def azure_enabled(self) -> bool:
        return bool(self.azure_speech_key) and not self.force_mock

    @property
    def tts_enabled(self) -> bool:
        return bool(self.google_tts_api_key) and not self.force_mock


@lru_cache
def get_settings() -> Settings:
    return Settings()
