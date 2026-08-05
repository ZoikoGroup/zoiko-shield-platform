package com.zoiko.shieldcore;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.modulith.Modulith;

@Modulith
@SpringBootApplication
public class ShieldCoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShieldCoreApplication.class, args);
    }
}
