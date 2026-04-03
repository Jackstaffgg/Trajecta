package dev.knalis.trajectaapi.service.impl;

import dev.knalis.trajectaapi.dto.notification.NotificationCreateRequest;
import dev.knalis.trajectaapi.dto.ws.WsEventType;
import dev.knalis.trajectaapi.dto.ws.payload.NotificationPayload;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.mapper.NotificationMapper;
import dev.knalis.trajectaapi.model.notiffication.Notification;
import dev.knalis.trajectaapi.repo.NotificationRepository;
import dev.knalis.trajectaapi.service.intrf.NotificationService;
import dev.knalis.trajectaapi.service.intrf.WsEventDispatcher;
import lombok.RequiredArgsConstructor;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {
    
    private final NotificationRepository notificationRepository;
    private static final Long SYSTEM_ID = -1488L;
    private final WsEventDispatcher wsEventDispatcher;
    private final NotificationMapper notificationMapper;
    @Autowired(required = false)
    private MeterRegistry meterRegistry;
    
    @Override
    @Cacheable(cacheNames = "notificationsByRecipient", key = "#userId")
    public List<Notification> getUserNotifications(Long userId) {
        return notificationRepository.findByRecipientId(userId);
    }
    
    @Override
    @CacheEvict(cacheNames = "notificationsByRecipient", key = "#request.recipientId")
    public Notification createNotification(NotificationCreateRequest request) {
        final var notification = new Notification();
        
        notification.setReferenceId(request.getReferenceId());
        notification.setType(request.getType());
        notification.setContent(request.getContent());
        
        if (request.getSenderId() == null) {
            notification.setSenderId(SYSTEM_ID);
            notification.setSenderName("System");
        } else {
            notification.setSenderId(request.getSenderId());
            notification.setSenderName(request.getSenderName());
        }

        notification.setRecipientId(request.getRecipientId());
        notification.setRead(false);
        notification.setCreatedAt(Instant.now());
        
        NotificationPayload payload = new NotificationPayload(notificationMapper.toDto(notification));
        wsEventDispatcher.emitToUsers(List.of(notification.getRecipientId()), WsEventType.NEW_NOTIFICATION , payload);
        incrementCounter("notifications.created");

        return notificationRepository.save(notification);
    }
    
    @Override
    @CacheEvict(cacheNames = "notificationsByRecipient", key = "#currentUserId")
    public void markAsRead(Long notificationId, Long currentUserId) {
        final var notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NotFoundException("Notification not found"));

        if (!notification.getRecipientId().equals(currentUserId)) {
            throw new PermissionDeniedException("You do not have permission to update this notification");
        }

        notification.setRead(true);
        notificationRepository.save(notification);
        incrementCounter("notifications.markAsRead.single");
    }
    
    @Override
    @CacheEvict(cacheNames = "notificationsByRecipient", key = "#currentUserId")
    public void markAllAsRead(Long currentUserId) {
        final var unreadNotifications = notificationRepository.findByRecipientIdAndIsRead(currentUserId, false);
        
        for (var notification : unreadNotifications) {
            notification.setRead(true);
        }
        
        notificationRepository.saveAll(unreadNotifications);
        incrementCounterBy("notifications.markAsRead.bulk", unreadNotifications.size());
    }
    
    @Override
    @CacheEvict(cacheNames = "notificationsByRecipient", key = "#currentUserId")
    public void deleteNotification(Long notificationId, Long currentUserId) {
        final var notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NotFoundException("Notification not found"));

        if (!notification.getRecipientId().equals(currentUserId)) {
            throw new PermissionDeniedException("You do not have permission to delete this notification");
        }

        notificationRepository.deleteById(notificationId);
        incrementCounter("notifications.deleted");
    }

    private void incrementCounter(String name) {
        incrementCounterBy(name, 1);
    }

    private void incrementCounterBy(String name, int amount) {
        if (meterRegistry == null || amount <= 0) {
            return;
        }
        meterRegistry.counter(name).increment(amount);
    }
}


