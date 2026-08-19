from typing import Dict, Any, Type, Optional

class ServiceContainer:
    """Central Dependency Injection container for managing application services."""

    def __init__(self):
        self._services: Dict[str, Any] = {}
        self._factories: Dict[str, Type] = {}

    def register_singleton(self, service_name: str, instance: Any):
        """Registers a singleton instance."""
        self._services[service_name] = instance

    def register_factory(self, service_name: str, factory_cls: Type):
        """Registers a factory class for transient instances."""
        self._factories[service_name] = factory_cls

    def get(self, service_name: str) -> Any:
        """Retrieves a service by name."""
        if service_name in self._services:
            return self._services[service_name]
        if service_name in self._factories:
            return self._factories[service_name]()
        raise KeyError(f"Service '{service_name}' not registered in ServiceContainer.")

    def has(self, service_name: str) -> bool:
        return service_name in self._services or service_name in self._factories

# Global service container instance
container = ServiceContainer()

def init_services():
    """Initializes and registers core backend domain managers into container."""
    from gnomeai_backend.core.jobs import job_manager
    from gnomeai_backend.core.sessions import session_manager
    from gnomeai_backend.core.workspace import workspace_manager
    from gnomeai_backend.core.learnings import learnings_manager
    from gnomeai_backend.interfaces.tool import tool_registry

    container.register_singleton("job_manager", job_manager)
    container.register_singleton("session_manager", session_manager)
    container.register_singleton("workspace_manager", workspace_manager)
    container.register_singleton("learnings_manager", learnings_manager)
    container.register_singleton("tool_registry", tool_registry)

# Run default initialization
init_services()
