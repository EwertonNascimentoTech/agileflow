"""
Singleton do slowapi limiter — importado por main.py e pelas rotas que precisam de rate limit.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
