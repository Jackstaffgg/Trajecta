package dev.knalis.trajectaapi.service.impl;

import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserDetailsServiceImplTest {

    @Mock
    private UserRepository userRepository;

    private UserDetailsServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new UserDetailsServiceImpl(userRepository);
    }

    @Test
    void loadUserByUsername_returnsUser() {
        User user = new User();
        user.setUsername("alex");
        when(userRepository.findByUsername("alex")).thenReturn(Optional.of(user));

        var details = service.loadUserByUsername("alex");

        assertThat(details.getUsername()).isEqualTo("alex");
    }

    @Test
    void loadUserByUsername_throwsWhenNotFound() {
        when(userRepository.findByUsername("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.loadUserByUsername("missing"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}

