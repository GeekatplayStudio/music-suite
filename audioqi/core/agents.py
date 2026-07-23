from __future__ import annotations

from typing import Any, TypedDict

try:
    from langgraph.graph import END, StateGraph  # type: ignore
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False


class MasteringAgentState(TypedDict):
    metrics: dict[str, Any]
    eq_suggestions: list[str]
    dynamics_suggestions: list[str]
    safety_warnings: list[str]
    final_settings: dict[str, Any]


def tonal_analysis_agent(state: MasteringAgentState) -> dict[str, Any]:
    metrics = state.get("metrics", {})
    spectral = metrics.get("spectral_balance", {})
    suggestions = []

    # High sub-bass protection
    if spectral.get("sub_20_60", 0.0) > 0.18:
        suggestions.append("Apply a low-shelf cut below 60 Hz to protect headroom.")
    # Air boost
    if spectral.get("air_10k_20k", 0.0) < 0.04:
        suggestions.append("Add a gentle high-shelf boost around 12 kHz to open top-end.")

    return {"eq_suggestions": suggestions}


def dynamics_analysis_agent(state: MasteringAgentState) -> dict[str, Any]:
    metrics = state.get("metrics", {})
    dynamics = metrics.get("dynamics", {})
    suggestions = []

    crest = dynamics.get("crest_factor_db", 12.0)
    if crest < 9.0:
        suggestions.append("Mix is dense. Use soft, slow compression with low ratio (1.5:1).")
    elif crest > 18.0:
        suggestions.append("Mix has wide dynamics. Use moderate peak compression with 2.5:1 ratio.")

    return {"dynamics_suggestions": suggestions}


def safety_guard_agent(state: MasteringAgentState) -> dict[str, Any]:
    metrics = state.get("metrics", {})
    dynamics = metrics.get("dynamics", {})
    warnings = []
    settings = {}

    tp = dynamics.get("true_peak_estimate", 0.0)
    if tp >= 0.99:
        warnings.append("True Peak exceeds safe headroom. Setting brickwall limiter threshold to -1.0 dBFS.")
        settings["limiter_threshold_dbfs"] = -1.0
    else:
        settings["limiter_threshold_dbfs"] = -0.5

    return {"safety_warnings": warnings, "final_settings": settings}


class MockCompiledGraph:
    """Mock compiled graph fallback if langgraph is not installed."""
    def __init__(self) -> None:
        pass

    def invoke(self, inputs: dict[str, Any]) -> dict[str, Any]:
        state: MasteringAgentState = {
            "metrics": inputs.get("metrics", {}),
            "eq_suggestions": [],
            "dynamics_suggestions": [],
            "safety_warnings": [],
            "final_settings": {},
        }
        # Run nodes sequentially
        state.update(tonal_analysis_agent(state))
        state.update(dynamics_analysis_agent(state))
        state.update(safety_guard_agent(state))
        return dict(state)


def build_mastering_agent_graph() -> Any:
    if not HAS_LANGGRAPH:
        return MockCompiledGraph()

    workflow = StateGraph(MasteringAgentState)

    workflow.add_node("tonal_agent", tonal_analysis_agent)
    workflow.add_node("dynamics_agent", dynamics_analysis_agent)
    workflow.add_node("safety_guard", safety_guard_agent)

    workflow.set_entry_point("tonal_agent")
    workflow.add_edge("tonal_agent", "dynamics_agent")
    workflow.add_edge("dynamics_agent", "safety_guard")
    workflow.add_edge("safety_guard", END)

    return workflow.compile()
