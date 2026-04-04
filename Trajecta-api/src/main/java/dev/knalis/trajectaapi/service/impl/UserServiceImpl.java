package dev.knalis.trajectaapi.service.impl;

import dev.knalis.trajectaapi.dto.auth.RegisterRequest;
import dev.knalis.trajectaapi.dto.user.UserCreateRequest;
import dev.knalis.trajectaapi.dto.user.UserResponse;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.exception.BadRequestException;
import dev.knalis.trajectaapi.exception.FieldAlreadyExistException;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.model.Role;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import dev.knalis.trajectaapi.service.intrf.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserServiceImpl implements UserService {
    
    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    
    @Override
    @Transactional
    public User register(RegisterRequest request) {
        final var user = new User();
        
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new FieldAlreadyExistException("Username already exists");
        }
        
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setName(request.getName());
        
        return userRepository.save(user);
    }
    
    @Override
    @Transactional
    public User create(UserCreateRequest request, Authentication auth) {
        User creator = (User) auth.getPrincipal();
        if (creator.getRole() != Role.ADMIN) {
            throw new PermissionDeniedException("Only admins can create users");
        }
        
        final var username = request.getUsername();
        if (userRepository.existsByUsername(username)) {
            throw new FieldAlreadyExistException("Username already exists");
        }
        
        final var user = new User();
        
        if (request.getRole() == null || request.getRole().isBlank()) {
            throw new BadRequestException("Role cannot be null or empty");
        } else {
            try {
                final var role = Role.valueOf(request.getRole().toUpperCase());
                user.setRole(role);
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("Invalid role: " + request.getRole() + ". Allowed roles: " + Arrays.toString(Role.values()));
            }
        }
        
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setName(request.getName());
        
        return userRepository.save(user);
    }
    
    @Override
    public User findByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found with username: " + username));
    }
    
    @Override
    public User findById(long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found with id: " + id));
    }

    @Override
    public UserResponse findResponseById(long id) {
        return userMapper.toDto(findById(id));
    }
    
    @Override
    public List<User> findAll() {
        return userRepository.findAll();
    }

    @Override
    public List<UserResponse> findAllResponses() {
        return userMapper.toDtoList(findAll());
    }
    
    @Override
    @Transactional
    public void delete(long id) {

        userRepository.deleteById(id);
    }
    
    @Override
    @Transactional
    public User update(long id, UserUpdateRequest userUpdateRequest) {
        final var user = findById(id);
        
        if (userUpdateRequest.getUsername() != null && !userUpdateRequest.getUsername().equalsIgnoreCase(user.getUsername())) {
            if (userRepository.existsByUsername(userUpdateRequest.getUsername())) {
                throw new FieldAlreadyExistException("Username already exists");
            }
        }
        
        userMapper.updateUserFromDto(userUpdateRequest, user);
        
        return userRepository.save(user);
    }
    
    @Override
    public List<User> findByUsernameContaining(String username) {
        return userRepository.findByUsernameContainingIgnoreCase(username);
    }
    
}


