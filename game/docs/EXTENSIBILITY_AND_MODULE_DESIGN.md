# Extensibility and Module Design

**Status:** Foundational engineering policy  
**Scope:** Technical flexibility and changeability. This document deliberately does not define future gameplay features.

## 1. Core decision: a modular monolith first

Kings & Cards should begin as one browser application with strong internal module boundaries. We should not split it into services or introduce a complex third-party plugin runtime prematurely.

A modular monolith gives us:
- Simple local development and deployment.
- Direct, efficient communication between modules.
- Clear ownership and replaceable implementations.
- The option to introduce workers, plugins or separate processes later behind established contracts.

"Modular" means independently understandable, testable and replaceable components, not necessarily independently deployed programs.

## 2. Design for unknown future requirements

We cannot predict every system the game may eventually contain. Therefore, the architecture must provide general extension mechanisms rather than hardcode today's feature list into the core.

New functionality should be addable by:
1. Defining a module with a narrow responsibility.
2. Declaring the contracts it requires and the capabilities it provides.
3. Registering its systems, commands, queries, event handlers, data definitions or persistence contributions through the application composition root.
4. Testing it independently and testing its interactions with other modules.

The core should provide stable infrastructure and contracts. It should not contain detailed rules for every future system.

## 3. Proposed logical layers

These are conceptual boundaries to introduce incrementally. They do not require an immediate directory migration.

### Core
Small, stable primitives used across the application:
- Module lifecycle and composition.
- Simulation clock and update scheduler.
- Random-number generator interface and seed handling.
- Stable ID generation.
- Command and event contracts.
- Persistence contracts and schema versioning.
- Shared validation/result types.

Keep the core small. A feature belongs in core only when it is genuinely cross-cutting and does not depend on a particular gameplay domain.

### Domain modules
Self-contained areas of game logic. Each module owns its rules and authoritative data. Future modules should be possible without editing unrelated modules.

A domain module may expose:
- Public commands/actions that request changes.
- Queries/read models that expose information.
- Events that announce completed facts.
- Data definitions or registries.
- Simulation systems registered into explicit update phases.
- Serialization/deserialization contributions.

### Infrastructure adapters
Concrete implementations for external or platform-specific capabilities, such as browser storage, browser input, clocks, workers, audio or rendering backends.

Domain logic should depend on contracts, not directly on browser APIs or a particular storage/rendering implementation.

### Presentation
Canvas rendering, DOM UI, audio/visual effects and input mapping. Presentation reads state or query results and sends commands. It must not own game rules or authoritative data.

### Composition root
A small application entry point that selects concrete implementations, registers modules, validates dependencies and starts the runtime. This is the only place that should need to know the full set of concrete modules.

## 4. Communication rules

Use the simplest mechanism that fits each interaction.

### Direct contract/API call
Use when one module needs an immediate answer from a clearly owned capability. Prefer a narrow interface over importing another module's internal files.

### Command
Use to request a state change. Commands express intent and are validated by the module that owns the affected data.

### Event
Use to announce that something has happened, allowing interested modules to react without the producer knowing all consumers.

Events should describe facts (for example, an operation completed), not become a hidden remote-control mechanism. Do not use an event bus for every ordinary function call.

### Query/read model
Use to read data without giving the consumer permission to mutate the owning module's state.

Avoid unrestricted access to another module's internal collections.

## 5. Dependency rules

1. Dependencies must be explicit and form a directed acyclic graph.
2. Domain modules must not import presentation modules.
3. Simulation logic must not read or write the DOM or Canvas directly.
4. Presentation must not implement authoritative simulation rules.
5. Modules must not modify another module's private state.
6. Cross-module access goes through documented contracts.
7. Avoid circular imports. Shared contracts belong in lower-level packages/modules.
8. The composition root may depend on all modules; domain modules must not depend on the composition root.
9. Optional capabilities must be represented explicitly, not detected through fragile checks for arbitrary globals.

## 6. Module lifecycle

A module should have a documented lifecycle appropriate to its needs. The target lifecycle may include:

- **Register:** declare ID, version, dependencies and capabilities.
- **Initialize:** validate dependencies and prepare runtime services.
- **Start:** begin participation in the running game.
- **Update:** receive only the simulation phases it has registered for.
- **Serialize/restore:** contribute its owned persistent data.
- **Stop/dispose:** release temporary resources and subscriptions.

Not every module needs every hook. Avoid a generic lifecycle framework more complicated than the actual requirements.

Modules should not be hot-reloaded or switched during a running simulation by default. Replacing an implementation at application startup through the composition root is sufficient initially. Runtime swapping can be considered later for editor tooling or mod support.

## 7. Replaceable implementations

Capabilities that are likely to need alternative implementations should have stable contracts and be selected at the composition root.

Examples of replaceable technical capabilities include:
- World-generation strategy.
- Random-number generator implementation.
- Persistence backend.
- Pathfinding implementation.
- Spatial index implementation.
- Rendering backend.
- Input adapter.
- Simulation scheduler.

These are examples of extension points, not a commitment to build all alternatives now.

Replacing an implementation must preserve its contract. If the contract changes, version it and migrate its consumers deliberately.

## 8. Data-driven definitions

Where practical, use validated definitions/catalogues instead of large hardcoded switch statements.

A definition should describe data (such as an ID, parameters, tags or presentation metadata). Behaviour should live in a registered system or strategy.

Rules:
- Definitions have stable IDs.
- Definitions are validated at load/startup.
- Unknown IDs are handled explicitly.
- Data schema versions are tracked where persisted.
- Do not build an unrestricted scripting/eval system to make data "flexible".

Use typed or clearly documented contracts for extensible fields. Avoid an unstructured global bag of arbitrary properties.

## 9. State ownership

Each module owns the authoritative state for its responsibility.

The current global `state` object is a prototype convenience, not the long-term ownership model. It should be decomposed gradually into module-owned state partitions with explicit read/write APIs.

A module may expose selectors or read models, but other modules must not mutate its internal objects directly.

Persistent domain state must be separate from transient runtime objects such as:
- DOM nodes.
- Canvas and rendering contexts.
- Event listeners.
- Animation handles.
- Cached images or prerendered canvases.
- Temporary particles and UI effects where persistence is not intended.

## 10. Extensibility without overengineering

Do not build speculative infrastructure before a real use case requires it.

In particular:
- No microservices for an offline/browser simulation.
- No arbitrary third-party plugin marketplace/runtime in the foundation phase.
- No universal entity-component framework unless the requirements and measured benefits justify it.
- No global event bus as a substitute for understandable dependencies.
- No excessive abstraction around one-off, stable code.

Prefer a simple working module with a clear contract. Generalize when a second real implementation or repeated use case proves the abstraction is valuable.

## 11. Acceptance criteria for a new module

A module is ready to integrate when:
- Its responsibility and public contract are documented.
- Required capabilities and dependencies are explicit.
- It does not reach into another module's private state.
- It can be tested without loading unrelated presentation code.
- Its persistent data has a defined schema if it owns saved state.
- Its registration and lifecycle are deterministic.
- It can be replaced or disabled at startup where its contract permits this.
- Integration tests cover important interactions with dependent modules.

## 12. Evolution rule

Preserve compatibility where reasonable, but do not let a weak early prototype API become permanent. If a contract needs to change, update it deliberately, update every consumer, add migration/tests where needed, and record the decision.

The target is not an architecture that never changes. It is an architecture that can change safely.
