package dev.knalis.trajectaapi.exception.handler;

import dev.knalis.trajectaapi.dto.common.ApiResponse;
import dev.knalis.trajectaapi.exception.*;
import io.jsonwebtoken.ExpiredJwtException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.UnknownHostException;

@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    private ResponseEntity<ApiResponse<Void>> buildResponse(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(ApiResponse.failure(status.value(), code, message));
    }
    
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFoundException(NotFoundException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, "NOT_FOUND", "The requested resource was not found.");
    }
    
    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadRequestException(BadRequestException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "The request was invalid or cannot be processed.");
    }
    
    @ExceptionHandler(FieldAlreadyExistException.class)
    public ResponseEntity<ApiResponse<Void>> handleFieldAlreadyExistException(FieldAlreadyExistException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "FIELD_ALREADY_EXISTS", "The field already exists.");
    }
    
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadCredentialsException(BadCredentialsException ex) {
        return buildResponse(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "Invalid username or password.");
    }

    @ExceptionHandler({AuthenticationException.class, AuthenticationCredentialsNotFoundException.class})
    public ResponseEntity<ApiResponse<Void>> handleAuthenticationException(Exception ex) {
        return buildResponse(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required to access this resource.");
    }
    
    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<ApiResponse<Void>> handleRateLimitException(RateLimitException ex) {
        return buildResponse(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT", "Too many requests. Please try again later.");
    }
    
    @ExceptionHandler(PermissionDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handlePermissionDeniedException(PermissionDeniedException ex) {
        return buildResponse(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action.");
    }
    
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDeniedException(AccessDeniedException ex) {
        return buildResponse(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to access this resource.");
    }
    
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupportedException(HttpRequestMethodNotSupportedException ex) {
        return buildResponse(
                HttpStatus.METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "This request method is not supported for this resource. Please use a different HTTP method."
        );
    }
    
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMessageNotReadableException(HttpMessageNotReadableException ex) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "MESSAGE_NOT_READABLE",
                "The request body could not be read or is invalid. Please check the request format."
        );
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodArgumentTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "ARGUMENT_TYPE_MISMATCH",
                "One or more request parameters have an invalid type."
        );
    }
    
    @ExceptionHandler(ExpiredJwtException.class)
    public ResponseEntity<ApiResponse<Void>> handleExpiredJwtException(ExpiredJwtException ex) {
        return buildResponse(
                HttpStatus.UNAUTHORIZED,
                "TOKEN_EXPIRED",
                "Your session has expired. Please log in again."
        );
    }
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationExceptions(MethodArgumentNotValidException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Validation failed for request payload.");
    }
    
    @ExceptionHandler(InternalServerException.class)
    public ResponseEntity<ApiResponse<Void>> handleInternalServerException(InternalServerException ex) {
        if (isCausedBy(ex, UnknownHostException.class)) {
            log.warn("External dependency host is unreachable", ex.getCause());
            return buildResponse(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "DEPENDENCY_UNAVAILABLE",
                    "Required external service is temporarily unavailable. Please try again later."
            );
        }

        log.error("Internal server error occurred", ex.getCause());
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Internal server error.");
    }
    
     @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception ex) {
        log.error("Unexpected error occurred", ex);
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "UNEXPECTED_ERROR", "An unexpected error occurred. Please try again later.");
    }

    private boolean isCausedBy(Throwable throwable, Class<? extends Throwable> type) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

}


