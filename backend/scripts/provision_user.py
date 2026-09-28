"""Explicit account provisioning; never called during application startup."""
import argparse
from getpass import getpass
import os
from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402
from app.database import engine  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services.provisioning import seed_demo_user  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="Create missing demo users; development/test only")
    parser.add_argument("--username")
    parser.add_argument("--email")
    args = parser.parse_args()
    if args.demo:
        seed_demo_user()
        return
    if not args.username or not args.email:
        parser.error("--username and --email are required")
    password = os.environ.get("BOOTSTRAP_PASSWORD") or getpass("New administrator password: ")
    if len(password) < 12 or len(password.encode()) > 72:
        parser.error("Password must have at least 12 characters and at most 72 bytes")
    with engine.begin() as connection:
        result = connection.execute(text("""
            INSERT INTO usuarios (id, username, email, hashed_password, role, activo)
            VALUES (:id, :username, :email, :password, 'admin', TRUE)
            ON CONFLICT (username) DO NOTHING
        """), {"id": uuid4(), "username": args.username, "email": args.email, "password": hash_password(password)})
        print("Administrator created" if result.rowcount else "Account already exists; unchanged")


if __name__ == "__main__":
    main()
