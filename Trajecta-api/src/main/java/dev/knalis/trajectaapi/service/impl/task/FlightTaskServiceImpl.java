package dev.knalis.trajectaapi.service.impl.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.knalis.trajectaapi.dto.messaging.AnalysisResult;
import dev.knalis.trajectaapi.dto.task.TaskBulkDeleteResponse;
import dev.knalis.trajectaapi.event.EventPublisher;
import dev.knalis.trajectaapi.exception.BadRequestException;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.exception.RateLimitException;
import dev.knalis.trajectaapi.factory.FlightTaskFactory;
import dev.knalis.trajectaapi.mapper.FlightMetricMapper;
import dev.knalis.trajectaapi.model.user.Role;
import dev.knalis.trajectaapi.model.user.User;
import dev.knalis.trajectaapi.model.task.FlightMetrics;
import dev.knalis.trajectaapi.model.task.FlightTask;
import dev.knalis.trajectaapi.model.task.ai.AiConclusion;
import dev.knalis.trajectaapi.repo.AiConclusionRepository;
import dev.knalis.trajectaapi.repo.FlightMetricsRepository;
import dev.knalis.trajectaapi.repo.FlightTaskRepository;
import dev.knalis.trajectaapi.security.AiConclusionRateLimiter;
import dev.knalis.trajectaapi.security.TaskCreationRateLimiter;
import dev.knalis.trajectaapi.dto.task.AiConclusionGenerationResult;
import dev.knalis.trajectaapi.service.intrf.task.AiConclusionService;
import dev.knalis.trajectaapi.service.intrf.task.FileService;
import dev.knalis.trajectaapi.service.intrf.task.FlightTaskService;
import dev.knalis.trajectaapi.storage.ObjectKeyBuilder;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class FlightTaskServiceImpl implements FlightTaskService {

    private final FlightTaskRepository taskRepository;
    private final FileService fileService;
    private final FlightMetricsRepository metricsRepository;
    private final AiConclusionRepository aiConclusionRepository;
    private final AiConclusionRateLimiter aiConclusionRateLimiter;
    private final TaskCreationRateLimiter taskCreationRateLimiter;
    private final FlightMetricMapper flightMetricMapper;
    private final FlightTaskFactory taskFactory;
    private final EventPublisher eventPublisher;
    private final ObjectKeyBuilder objectKeyBuilder;
    private final ObjectMapper objectMapper;
    private final AiConclusionService aiConclusionService;
    @Autowired(required = false)
    private MeterRegistry meterRegistry;
    
    @Transactional
    @Override
    @Caching(evict = {
            @CacheEvict(cacheNames = "taskRawKey", allEntries = true),
            @CacheEvict(cacheNames = "taskTrajectoryKey", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByIdAndUserV3", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByUserPageV3", allEntries = true)
    })
    public FlightTask createAndStartAnalysis(String title, MultipartFile file, Long userId) {
        checkRateLimit(userId);
        
        FlightTask task = taskFactory.create(title, userId);
        FlightTask savedTask = taskRepository.save(task);
        
        String rawLogKey = objectKeyBuilder.buildRawLogKey(userId, savedTask.getId());
        
        try {
            fileService.uploadToKey(rawLogKey, file);
            
            savedTask.setRawLogObjectKey(rawLogKey);
            savedTask = taskRepository.save(savedTask);
            
            eventPublisher.publishTaskStatusChanged(
                    savedTask.getId(),
                    savedTask.getUserId(),
                    savedTask.getTitle(),
                    savedTask.getStatus(),
                    savedTask.getErrorMessage()
            );
            
            eventPublisher.publishAnalysisRequested(
                    savedTask.getId()
            );

            incrementCounter("tasks.created");
            
            return savedTask;
        } catch (Exception e) {
            fileService.delete(rawLogKey);
            throw e;
        }
    }
    
    @Override
    public FlightTask getTask(Long taskId, Authentication auth) {
        User currentUser = getCurrentUser(auth);
        
        FlightTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NotFoundException("Task not found"));
        
        if (!currentUser.getId().equals(task.getUserId()) && currentUser.getRole() != Role.ADMIN) {
            throw new PermissionDeniedException("You do not have permission to access this task");
        }
        
        return task;
    }
    
    @Override
    public List<FlightTask> getMyTasks(Authentication auth, int offset, int limit) {
        validatePaginationParams(offset, limit);
        
        User currentUser = getCurrentUser(auth);
        int page = offset / limit;
        
        return taskRepository.findByUserIdOrderByCreatedAtDesc(
                currentUser.getId(),
                PageRequest.of(page, limit)
        ).getContent();
    }
    
    @Transactional
    @Override
    @Caching(evict = {
            @CacheEvict(cacheNames = "taskRawKey", key = "#p0.taskId"),
            @CacheEvict(cacheNames = "taskTrajectoryKey", key = "#p0.taskId"),
            @CacheEvict(cacheNames = "taskDtoByIdAndUserV3", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByUserPageV3", allEntries = true)
    })
    public FlightTask completeTask(AnalysisResult result) {
        FlightTask task = taskRepository.findById(result.getTaskId())
                .orElseThrow(() -> new NotFoundException("Task not found"));
        
        if (task.getStatus().isTerminal()) {
            return task;
        }
        
        if (result.getStatus().isSuccess()) {
            final String trajectoryKey = resolveTrajectoryKey(task, result);
            if (trajectoryKey == null || trajectoryKey.isBlank()) {
                task.markFailed("Trajectory file is missing in analysis result");
                incrementCounter("tasks.completed.failed_missing_trajectory");
            } else {
                task.markCompleted(trajectoryKey);
                incrementCounter("tasks.completed.success");
            }
            
            if (result.getMetrics() != null) {
                FlightMetrics metrics = flightMetricMapper.mapMetrics(
                        task.getId(),
                        result.getMetrics()
                );
                metricsRepository.save(metrics);
            }
        } else {
            task.markFailed(result.getErrorMessage());
            incrementCounter("tasks.completed.failed_result");
        }
        
        task.setFinishedAt(Instant.now());
        
        FlightTask savedTask = taskRepository.save(task);
        
        eventPublisher.publishTaskStatusChanged(
                savedTask.getId(),
                savedTask.getUserId(),
                savedTask.getTitle(),
                savedTask.getStatus(),
                savedTask.getErrorMessage()
        );
        
        return savedTask;
    }

    private String resolveTrajectoryKey(FlightTask task, AnalysisResult result) {
        if (result.getTrajectoryObjectKey() != null && !result.getTrajectoryObjectKey().isBlank()) {
            return result.getTrajectoryObjectKey();
        }

        if (result.getTrajectoryJson() == null || result.getTrajectoryJson().isBlank()) {
            return null;
        }

        String trajectoryKey = objectKeyBuilder.buildTrajectoryKey(task.getUserId(), task.getId());
        fileService.uploadJson(trajectoryKey, result.getTrajectoryJson());
        return trajectoryKey;
    }
    
    @Override
    @Cacheable(cacheNames = "taskRawKey", key = "#taskId")
    public String getTaskRawKey(Long taskId, Authentication auth) {
        final var task = getTask(taskId, auth);
        final String rawKey = task.getRawLogObjectKey();
        
        if (rawKey == null || rawKey.isEmpty()) {
            throw new NotFoundException("Task not found");
        }
        
        return rawKey;
    }

    @Override
    @Cacheable(cacheNames = "taskRawKey", key = "#taskId")
    public String getTaskRawKeyInternal(Long taskId) {
        final var task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NotFoundException("Task not found"));
        final String rawKey = task.getRawLogObjectKey();

        if (rawKey == null || rawKey.isEmpty()) {
            throw new NotFoundException("Task not found");
        }

        return rawKey;
    }
    
    @Override
    @Cacheable(cacheNames = "taskTrajectoryKey", key = "#taskId")
    public String getTaskTrajectoryKey(Long taskId, Authentication auth) {
        final var task = getTask(taskId, auth);
        final var trajectoryKey = task.getTrajectoryObjectKey();
        
        if (trajectoryKey == null || trajectoryKey.isEmpty()) {
            throw new NotFoundException("Trajectory key not found");
        }
        
        return trajectoryKey;
    }
    
    @Override
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = "taskDtoByIdAndUserV3", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByUserPageV3", allEntries = true)
    })
    public FlightTask addAiConclusion(Long taskId, Authentication auth) {
        return generateAiConclusion(taskId, auth, false);
    }

    @Override
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = "taskDtoByIdAndUserV3", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByUserPageV3", allEntries = true)
    })
    public FlightTask regenerateAiConclusion(Long taskId, Authentication auth) {
        return generateAiConclusion(taskId, auth, true);
    }

    @Override
    @Transactional
    @Caching(evict = {
            @CacheEvict(cacheNames = "taskRawKey", allEntries = true),
            @CacheEvict(cacheNames = "taskTrajectoryKey", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByIdAndUserV3", allEntries = true),
            @CacheEvict(cacheNames = "taskDtoByUserPageV3", allEntries = true)
    })
    public TaskBulkDeleteResponse deleteTasks(List<Long> taskIds, Authentication auth) {
        if (taskIds == null || taskIds.isEmpty()) {
            throw new BadRequestException("Task ids must not be empty");
        }

        User currentUser = getCurrentUser(auth);
        List<Long> requestedIds = taskIds.stream()
                .filter(id -> id != null && id > 0)
                .distinct()
                .toList();

        if (requestedIds.isEmpty()) {
            throw new BadRequestException("Task ids must not be empty");
        }

        List<Long> deleted = new ArrayList<>();
        List<Long> skipped = new ArrayList<>();

        for (Long taskId : requestedIds) {
            var optionalTask = taskRepository.findById(taskId);
            if (optionalTask.isEmpty()) {
                skipped.add(taskId);
                continue;
            }

            FlightTask task = optionalTask.get();
            if (!currentUser.getId().equals(task.getUserId()) && currentUser.getRole() != Role.ADMIN) {
                skipped.add(taskId);
                continue;
            }

            safelyDeleteObject(task.getRawLogObjectKey());
            safelyDeleteObject(task.getTrajectoryObjectKey());

            metricsRepository.deleteByTaskId(taskId);

            AiConclusion aiConclusion = task.getAiConclusion();
            if (aiConclusion == null) {
                aiConclusion = aiConclusionRepository.findByFlightTaskId(taskId).orElse(null);
            }
            if (aiConclusion != null) {
                task.setAiConclusion(null);
                task.setHasAiConclusion(false);
                aiConclusion.setFlightTask(null);
                aiConclusionRepository.delete(aiConclusion);
            }

            taskRepository.delete(task);
            deleted.add(taskId);
        }

        incrementCounter("tasks.deleted.bulk");
        return TaskBulkDeleteResponse.builder()
                .deletedTaskIds(deleted)
                .skippedTaskIds(skipped)
                .build();
    }

    private FlightTask generateAiConclusion(Long taskId, Authentication auth, boolean force) {
        FlightTask task = getTask(taskId, auth);

        if (!force && task.getAiConclusion() != null && task.getAiConclusion().getConclusion() != null && !task.getAiConclusion().getConclusion().isBlank()) {
            return task;
        }

        checkAiConclusionRateLimit(task.getUserId());

        String trajectoryKey = task.getTrajectoryObjectKey();
        if (trajectoryKey == null || trajectoryKey.isBlank()) {
            throw new NotFoundException("Trajectory key not found");
        }

        String trajectoryContent = readTrajectoryContent(trajectoryKey);
        AiConclusionGenerationResult generationResult = aiConclusionService.generateConclusion(trajectoryContent);
        String conclusion = generationResult.conclusion();
        if (conclusion == null || conclusion.isBlank()) {
            throw new BadRequestException("AI conclusion must not be empty");
        }

        String updatedTrajectory = appendConclusionToTrajectory(trajectoryContent, conclusion);
        fileService.uploadJson(trajectoryKey, updatedTrajectory);

        AiConclusion aiConclusion = task.getAiConclusion();
        if (aiConclusion == null) {
            aiConclusion = aiConclusionRepository.findByFlightTaskId(task.getId()).orElseGet(AiConclusion::new);
        }
        aiConclusion.setFlightTask(task);
        aiConclusion.setConclusion(conclusion);
        aiConclusion.setAiModel(generationResult.model());
        aiConclusion.setErrorMessage(generationResult.errorMessage());

        task.setAiConclusion(aiConclusionRepository.save(aiConclusion));
        task.setHasAiConclusion(true);
        incrementCounter("tasks.ai_conclusion.added");
        return taskRepository.save(task);
    }
    
    private void incrementCounter(String name) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter(name).increment();
    }
    
    private void checkRateLimit(Long userId) {
        if (!taskCreationRateLimiter.isAllowed(userId)) {
            throw new RateLimitException("Too many task creation attempts");
        }
        taskCreationRateLimiter.onAttempt(userId);
    }

    private void checkAiConclusionRateLimit(Long userId) {
        if (!aiConclusionRateLimiter.isAllowed(userId)) {
            throw new RateLimitException("Too many AI conclusion generation attempts");
        }
        aiConclusionRateLimiter.onAttempt(userId);
    }

    private void safelyDeleteObject(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }
        try {
            fileService.delete(objectKey);
        } catch (Exception ignored) {
        }
    }
    
    private User getCurrentUser(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof User user)) {
            throw new PermissionDeniedException("User is not authenticated");
        }
        return user;
    }
    
    private void validatePaginationParams(int offset, int limit) {
        if (offset < 0) {
            throw new BadRequestException("Offset must be >= 0");
        }
        if (limit <= 0 || limit > 100) {
            throw new BadRequestException("Limit must be between 1 and 100");
        }
        if (offset % limit != 0) {
            throw new BadRequestException("Offset must be divisible by limit");
        }
    }

    private String readTrajectoryContent(String trajectoryKey) {
        try (var inputStream = fileService.getObjectStream(trajectoryKey)) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new BadRequestException("Failed to read trajectory file");
        }
    }

    private String appendConclusionToTrajectory(String trajectoryContent, String conclusion) {
        try {
            var root = objectMapper.readTree(trajectoryContent);
            ObjectNode wrapper;

            if (root instanceof ObjectNode objectNode) {
                wrapper = objectNode;
            } else {
                wrapper = objectMapper.createObjectNode();
                wrapper.set("trajectory", root);
            }

            wrapper.put("aiConclusion", conclusion);
            return objectMapper.writeValueAsString(wrapper);
        } catch (Exception ex) {
            return trajectoryContent + System.lineSeparator() + System.lineSeparator() + "AI Conclusion: " + conclusion;
        }
    }
}

