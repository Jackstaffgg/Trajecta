package dev.knalis.trajectaapi.service.impl.user;

import dev.knalis.trajectaapi.dto.auth.RegisterRequest;
import dev.knalis.trajectaapi.dto.user.UserUpdateRequest;
import dev.knalis.trajectaapi.exception.BadRequestException;
import dev.knalis.trajectaapi.exception.FieldAlreadyExistException;
import dev.knalis.trajectaapi.exception.NotFoundException;
import dev.knalis.trajectaapi.exception.PermissionDeniedException;
import dev.knalis.trajectaapi.mapper.UserMapper;
import dev.knalis.trajectaapi.model.user.Role;
import dev.knalis.trajectaapi.model.user.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import dev.knalis.trajectaapi.service.intrf.user.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserServiceImpl implements UserService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;
    private final CacheManager cacheManager;
    
    @Override
    @Transactional
    public User register(RegisterRequest request) {
        final var user = new User();
        
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new FieldAlreadyExistException("Username already exists");
        }
        
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new FieldAlreadyExistException("Email already exists");
        }
        
        user.setUsername(request.getUsername());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setEmail(request.getEmail());
        user.setName(request.getName());
        
        User savedUser = userRepository.save(user);
        evictUserPageCache();
        return savedUser;
    }
    
    @Override
    @Transactional
    public User updateRole(long targetId, Role targetRole, Authentication auth) {
        final var currentUser = getCurrentUser(auth);
        final var targetUser = findById(targetId);
        final var requesterRole = currentUser.getRole();
        final var targetUserRole = targetUser.getRole();
        
        if (requesterRole != Role.OWNER) {
            throw new PermissionDeniedException("Only owner can change user role");
        }
        
        if (currentUser.getId().equals(targetUser.getId())) {
            throw new PermissionDeniedException("Owner cannot change own role");
        }
        
        if (targetUserRole == targetRole) {
            throw new BadRequestException("User already has role: " + targetRole);
        }
        
        if (targetUserRole == Role.OWNER) {
            throw new PermissionDeniedException("Cannot change role of another owner");
        }
        
        targetUser.setRole(targetRole);
        User savedUser = userRepository.save(targetUser);
        evictUserCache(savedUser.getId(), savedUser.getUsername());
        evictUserPageCache();
        return savedUser;
    }
    
    @Override
    @Cacheable(cacheNames = "userByUsernameV1", key = "#username.toLowerCase()")
    public User findByUsername(String username) {
        return userRepository.findByUsername(username).orElseThrow(() -> new NotFoundException("User not found with username: " + username));
    }
    
    @Override
    @Cacheable(cacheNames = "userByIdV1", key = "#id")
    public User findById(long id) {
        return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User not found with id: " + id));
    }
    
    @Override
    public List<User> findAll() {
        return userRepository.findAll();
    }
    
    @Override
    @Cacheable(cacheNames = "userPageV1", key = "#page + ':' + #size")
    public List<User> findAll(int page, int size) {
        return userRepository
                .findAll(PageRequest.of(page, size))
                .getContent();
    }
    
    @Override
    @Transactional
    public void delete(long targetId, Authentication auth) {
        final var currentUser = getCurrentUser(auth);
        final var target = findById(targetId);
        
        if (currentUser.getId().equals(target.getId())) {
            throw new PermissionDeniedException("Users cannot delete themselves");
        }
        
        if (currentUser.getRole() != Role.OWNER) {
            throw new PermissionDeniedException("Only owner can delete users");
        }
        
        if (target.getRole() == Role.OWNER) {
            throw new PermissionDeniedException("Cannot delete another owner");
        }
        
        userRepository.delete(target);
        evictUserCache(target.getId(), target.getUsername());
        evictUserPageCache();
    }
    
    @Override
    @Transactional
    public User updateCurrentUser(Authentication auth, UserUpdateRequest userUpdateRequest) {
        final var currentUser = getCurrentUser(auth);
        final String oldUsername = currentUser.getUsername();
        
        if (userUpdateRequest.getUsername() != null && !userUpdateRequest.getUsername().equalsIgnoreCase(currentUser.getUsername())) {
            if (userRepository.existsByUsername(userUpdateRequest.getUsername())) {
                throw new FieldAlreadyExistException("Username already exists");
            }
        }
        
        if (userUpdateRequest.getEmail() != null && !userUpdateRequest.getEmail().equalsIgnoreCase(currentUser.getEmail())) {
            if (userRepository.existsByEmail(userUpdateRequest.getEmail())) {
                throw new FieldAlreadyExistException("Email already exists");
            }
        }
        
        if (userUpdateRequest.getPassword() != null) {
            if (!passwordEncoder.matches(userUpdateRequest.getOldPassword(), currentUser.getPassword())) {
                throw new BadRequestException("Old password is incorrect");
            }
        }
        
        userMapper.updateUserFromDto(userUpdateRequest, currentUser);
        
        User savedUser = userRepository.save(currentUser);
        evictUserCache(savedUser.getId(), oldUsername);
        evictUserCache(savedUser.getId(), savedUser.getUsername());
        evictUserPageCache();
        return savedUser;
    }
    
    private User getCurrentUser(Authentication auth) {
        return findByUsername(auth.getName());
    }
    
    private void evictUserCache(Long userId, String username) {
        evictCacheKey("userByIdV1", userId);
        if (username != null && !username.isBlank()) {
            evictCacheKey("userByUsernameV1", username.toLowerCase(Locale.ROOT));
        }
    }

    private void evictUserPageCache() {
        Cache userPageCache = cacheManager.getCache("userPageV1");
        if (userPageCache != null) {
            userPageCache.clear();
        }
    }

    private void evictCacheKey(String cacheName, Object key) {
        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            cache.evict(key);
        }
    }
    
}
