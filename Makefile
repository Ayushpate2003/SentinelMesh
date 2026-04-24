COMPOSE=docker compose

.PHONY: dev-min dev prod down logs ps

dev-min:
	$(COMPOSE) --profile dev-min up --build

dev:
	$(COMPOSE) --profile dev up --build

prod:
	$(COMPOSE) --profile full up --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps
