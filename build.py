"""Build the Vite frontend before Vercel promotes it alongside FastAPI."""

import os
import subprocess


def main() -> None:
    env = os.environ.copy()
    env.setdefault("PORT", "3000")
    env.setdefault("BASE_PATH", "/")
    subprocess.run(
        ["pnpm", "--filter", "@workspace/sidewalk-ai", "run", "build"],
        check=True,
        env=env,
    )


if __name__ == "__main__":
    main()
