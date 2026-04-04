package dev.knalis.trajectaapi.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.knalis.trajectaapi.dto.messaging.AnalysisResult;
import dev.knalis.trajectaapi.event.EventPublisher;
import dev.knalis.trajectaapi.exception.BadRequestException;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.exception.RateLimitException;
import dev.knalis.trajectaapi.factory.FlightTaskFactory;
import dev.knalis.trajectaapi.mapper.FlightMetricMapper;
import dev.knalis.trajectaapi.model.Role;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.model.task.FlightMetrics;
import dev.knalis.trajectaapi.model.task.FlightTask;
import dev.knalis.trajectaapi.repo.FlightMetricsRepository;
import dev.knalis.trajectaapi.repo.FlightTaskRepository;
import dev.knalis.trajectaapi.security.TaskCreationRateLimiter;
import dev.knalis.trajectaapi.service.intrf.FileService;
import dev.knalis.trajectaapi.service.intrf.FlightTaskService;
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
import java.util.List;

@Service
@RequiredArgsConstructor
public class FlightTaskServiceImpl implements FlightTaskService {

    private static final String STATIC_AI_CONCLUSION = "AI conclusion is temporarily static. Please review trajectory manually until AI summarization is enabled.";
    
    private final FlightTaskRepository taskRepository;
    private final FileService fileService;
    private final FlightMetricsRepository metricsRepository;
    private final TaskCreationRateLimiter taskCreationRateLimiter;
    private final FlightMetricMapper flightMetricMapper;
    private final FlightTaskFactory taskFactory;
    private final EventPublisher eventPublisher;
    private final ObjectKeyBuilder objectKeyBuilder;
    private final ObjectMapper objectMapper;
    @Autowired(required = false)
    private MeterRegistry meterRegistry;
    
    @Transactional
    @Override
    @Caching(evict = {
            @CacheEvict(cacheNames = "tasksByUserPage", allEntries = true),
            @CacheEvict(cacheNames = "tasksById", allEntries = true),
            @CacheEvict(cacheNames = "taskRawKey", allEntries = true),
            @CacheEvict(cacheNames = "taskTrajectoryKey", allEntries = true)
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
    @Cacheable(cacheNames = "tasksById", key = "#taskId")
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
            @CacheEvict(cacheNames = "tasksById", key = "#p0.taskId"),
            @CacheEvict(cacheNames = "taskRawKey", key = "#p0.taskId"),
            @CacheEvict(cacheNames = "taskTrajectoryKey", key = "#p0.taskId"),
            @CacheEvict(cacheNames = "tasksByUserPage", allEntries = true)
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

    @Transactional
    @Override
    @Caching(evict = {
            @CacheEvict(cacheNames = "tasksById", key = "#taskId"),
            @CacheEvict(cacheNames = "taskTrajectoryKey", key = "#taskId"),
            @CacheEvict(cacheNames = "tasksByUserPage", allEntries = true)
    })
    public FlightTask addAiConclusion(Long taskId, Authentication auth) {
        FlightTask task = getTask(taskId, auth);

        if (task.isHasAiConclusion()) {
            return task;
        }

        String trajectoryKey = task.getTrajectoryObjectKey();
        if (trajectoryKey == null || trajectoryKey.isBlank()) {
            throw new NotFoundException("Trajectory file not found");
        }

        String trajectoryContent;
        try (var inputStream = fileService.getObjectStream(trajectoryKey)) {
            trajectoryContent = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new BadRequestException("Failed to read trajectory content");
        }

        String updatedContent = appendConclusionToTrajectory(trajectoryContent);
        fileService.uploadJson(trajectoryKey, updatedContent);

        task.setHasAiConclusion(true);
        incrementCounter("tasks.aiConclusion.added");
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

    private String appendConclusionToTrajectory(String trajectoryContent) {
        try {
            var root = objectMapper.readTree(trajectoryContent);
            ObjectNode wrapper;

            if (root instanceof ObjectNode objectNode) {
                wrapper = objectNode;
            } else {
                wrapper = objectMapper.createObjectNode();
                wrapper.set("trajectory", root);
            }

            wrapper.put("aiConclusion", STATIC_AI_CONCLUSION);
            return objectMapper.writeValueAsString(wrapper);
        } catch (Exception ex) {
            return trajectoryContent + System.lineSeparator() + System.lineSeparator() + "AI Conclusion: " + STATIC_AI_CONCLUSION;
        }
    }
}


