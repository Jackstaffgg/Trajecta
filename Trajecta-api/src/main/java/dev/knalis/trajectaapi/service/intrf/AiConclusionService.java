package dev.knalis.trajectaapi.service.intrf;

/**
 * Generates a concise AI conclusion for analyzed trajectory content.
 */
public interface AiConclusionService {
    AiConclusionGenerationResult generateConclusion(String trajectoryContent);
}


