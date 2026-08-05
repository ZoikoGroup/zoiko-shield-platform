package com.zoiko.shieldcore.control;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/control")
public class ControlController {

    @GetMapping
    public String getStatus() {
        return "control API is running";
    }
}
