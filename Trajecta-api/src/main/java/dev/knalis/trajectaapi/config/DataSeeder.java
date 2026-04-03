package dev.knalis.trajectaapi.config;

import dev.knalis.trajectaapi.model.Role;
import dev.knalis.trajectaapi.model.User;
import dev.knalis.trajectaapi.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Order(2)
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("knalis")) {
            
            User admin = new User();
            admin.setUsername("knalis");
            admin.setPassword(passwordEncoder.encode("Knl123"));
            admin.setName("System Administrator");
            admin.setEmail("admin@virtualedu.dev");
            admin.setRole(Role.ADMIN);
            
            userRepository.save(admin);
            
            System.out.println("=== Success: First admin is created ===");
            System.out.println("Login: knalis");
            System.out.println("Pass: Knl123");
            System.out.println("=========================================");
        }
    }
}


