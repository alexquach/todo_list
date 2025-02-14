//
//  TodoListAttributes.swift
//  TodoListApp
//
//  Created by Alex Quach on 2/6/25.
//
import ActivityKit

@available(iOS 16.1, *)
struct TodoListAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var taskCount: Int
    }
}
