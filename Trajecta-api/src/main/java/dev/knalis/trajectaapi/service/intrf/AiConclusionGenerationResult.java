package dev.knalis.trajectaapi.service.intrf;

import dev.knalis.trajectaapi.model.task.ai.AiModel;

public record AiConclusionGenerationResult(
        String conclusion,
        AiModel model,
        String errorMessage
) {
}

