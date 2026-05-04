import bcrypt


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def generate_token(user_id: int, username: str) -> str:
    """Generate a JWT token (placeholder)"""
    import jwt
    from datetime import datetime, timedelta
    import os

    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=7)
    }
    secret = os.getenv('JWT_SECRET', 'usop-jwt-secret-key')
    return jwt.encode(payload, secret, algorithm='HS256')


def decode_token(token: str) -> dict:
    """Decode a JWT token"""
    import jwt
    import os

    try:
        secret = os.getenv('JWT_SECRET', 'usop-jwt-secret-key')
        return jwt.decode(token, secret, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
