# NavHub

A modern, highly customizable dashboard.

## Development

Run `./dev.sh` to start both the frontend and backend locally.

## Deployment with Docker Compose

A production-ready `docker-compose.yaml` is provided.

```bash
docker-compose up -d
```

It provisions Postgres, Redis, and builds the multi-stage Dockerfile containing both frontend and backend automatically. You may optionally edit `config.toml` before starting it up to provide keys like `weather.key`.

## UI Configuration

NavHub supports single sign-on via the `SsoConfig` section. You can use casdoor or any OIDC compliant provider.
