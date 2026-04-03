package dev.knalis.trajectaapi.controller.rest.v1;

import dev.knalis.trajectaapi.controller.rest.v1.support.CurrentUserResolver;
import dev.knalis.trajectaapi.dto.notification.NotificationResponse;
import dev.knalis.trajectaapi.mapper.NotificationMapper;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.service.intrf.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationControllerTest {

    @Mock
    private NotificationService notificationService;
    @Mock
    private NotificationMapper notificationMapper;
    @Mock
    private CurrentUserResolver currentUserResolver;
    @Mock
    private Authentication authentication;

    private NotificationController controller;

    @BeforeEach
    void setUp() {
        controller = new NotificationController(notificationService, notificationMapper, currentUserResolver);
    }

    @Test
    void getMyNotifications_returnsMappedList() {
        User user = new User();
        user.setId(10L);
        when(currentUserResolver.requireUser(authentication)).thenReturn(user);
        when(notificationService.getUserNotifications(10L)).thenReturn(List.of());
        when(notificationMapper.toDtoList(List.of())).thenReturn(List.of(new NotificationResponse()));

        var response = controller.getMyNotifications(authentication);

        assertThat(response.getBody().isSuccess()).isTrue();
        assertThat(response.getBody().getData()).hasSize(1);
    }

    @Test
    void markAsRead_delegatesToService() {
        User user = new User();
        user.setId(10L);
        when(currentUserResolver.requireUser(authentication)).thenReturn(user);

        var response = controller.markAsRead(5L, authentication);

        verify(notificationService).markAsRead(5L, 10L);
        assertThat(response.getBody().isSuccess()).isTrue();
    }

    @Test
    void markAllAsRead_delegatesToService() {
        User user = new User();
        user.setId(11L);
        when(currentUserResolver.requireUser(authentication)).thenReturn(user);

        var response = controller.markAllAsRead(authentication);

        verify(notificationService).markAllAsRead(11L);
        assertThat(response.getBody().isSuccess()).isTrue();
    }

    @Test
    void deleteNotification_delegatesToService() {
        User user = new User();
        user.setId(12L);
        when(currentUserResolver.requireUser(authentication)).thenReturn(user);

        var response = controller.deleteNotification(9L, authentication);

        verify(notificationService).deleteNotification(9L, 12L);
        assertThat(response.getBody().isSuccess()).isTrue();
    }
}

